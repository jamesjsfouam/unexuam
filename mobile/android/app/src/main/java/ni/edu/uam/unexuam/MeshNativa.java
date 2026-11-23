package ni.edu.uam.unexuam;

import android.content.Context;
import android.util.Log;
import com.google.android.gms.nearby.Nearby;
import com.google.android.gms.nearby.connection.AdvertisingOptions;
import com.google.android.gms.nearby.connection.ConnectionInfo;
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback;
import com.google.android.gms.nearby.connection.ConnectionResolution;
import com.google.android.gms.nearby.connection.ConnectionsClient;
import com.google.android.gms.nearby.connection.ConnectionsStatusCodes;
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo;
import com.google.android.gms.nearby.connection.DiscoveryOptions;
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback;
import com.google.android.gms.nearby.connection.Payload;
import com.google.android.gms.nearby.connection.PayloadCallback;
import com.google.android.gms.nearby.connection.PayloadTransferUpdate;
import com.google.android.gms.nearby.connection.Strategy;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Transporte Mesh real 100% offline sobre Bluetooth / BLE / Wi-Fi Direct
 * usando Google Nearby Connections (Strategy.P2P_CLUSTER).
 * Descubre teléfonos cercanos con Unexuam sin internet ni emparejamiento manual,
 * intercambia perfiles/mensajes JSON y reenvía paquetes multi-salto con TTL.
 */
public class MeshNativa {
    private static final String TAG = "UnexuamMesh";
    private static final String SERVICE_ID = "ni.edu.uam.unexuam.mesh";
    private static final Strategy ESTRATEGIA = Strategy.P2P_CLUSTER;

    public interface Listener {
        void onEvento(String eventoJson);
    }

    private final ConnectionsClient client;
    private final Listener listener;
    private final Map<String, JSONObject> conectados = new ConcurrentHashMap<>();
    private final Map<String, JSONObject> pendientes = new ConcurrentHashMap<>();
    private final Set<String> vistos = Collections.synchronizedSet(new LinkedHashSet<>());

    private volatile JSONObject perfilLocal = new JSONObject();
    private volatile boolean activo = false;

    public MeshNativa(Context context, Listener listener) {
        this.client = Nearby.getConnectionsClient(context);
        this.listener = listener;
    }

    public synchronized void iniciar(String perfilJson) {
        try {
            perfilLocal = new JSONObject(perfilJson);
        } catch (Exception e) {
            perfilLocal = new JSONObject();
        }
        if (activo) {
            enviarHelloATodos();
            return;
        }
        activo = true;
        iniciarAnuncio();
        iniciarBusqueda();
    }

    public synchronized void actualizarPerfil(String perfilJson) {
        try {
            perfilLocal = new JSONObject(perfilJson);
        } catch (Exception ignored) {
        }
        if (activo) {
            enviarHelloATodos();
        }
    }

    public synchronized void detener() {
        activo = false;
        try {
            client.stopAdvertising();
            client.stopDiscovery();
            client.stopAllEndpoints();
        } catch (Exception ignored) {
        }
        conectados.clear();
        pendientes.clear();
    }

    public int enviarPaquete(String paqueteJson) {
        try {
            JSONObject obj = new JSONObject(paqueteJson);
            String id = obj.optString("id", "");
            if (!id.isEmpty()) registrarVisto(id);
        } catch (Exception ignored) {
        }
        if (conectados.isEmpty()) return 0;
        byte[] bytes = paqueteJson.getBytes(StandardCharsets.UTF_8);
        int enviados = 0;
        for (String endpointId : new ArrayList<>(conectados.keySet())) {
            client.sendPayload(endpointId, Payload.fromBytes(bytes));
            enviados++;
        }
        return enviados;
    }

    public String vecinosJson() {
        JSONArray arr = new JSONArray();
        for (JSONObject peer : conectados.values()) {
            arr.put(peer);
        }
        return arr.toString();
    }

    private String nombreEndpointLocal() {
        String cif = perfilLocal.optString("cif", "ANON");
        String nombre = perfilLocal.optString("nombre", "Usuario");
        String tel = perfilLocal.optString("telefono", "Tel-" + cif);
        String lugar = perfilLocal.optString("lugar", "Edificio E");
        return cif + "|" + nombre + "|" + tel + "|" + lugar;
    }

    private JSONObject parsearEndpoint(String endpointId, String nombreEndpoint) {
        JSONObject p = new JSONObject();
        try {
            String[] partes = nombreEndpoint != null ? nombreEndpoint.split("\\|", -1) : new String[0];
            p.put("endpointId", endpointId);
            p.put("cif", partes.length > 0 && !partes[0].isEmpty() ? partes[0] : "PEER-" + endpointId);
            p.put("nombre", partes.length > 1 && !partes[1].isEmpty() ? partes[1] : "Teléfono cercano");
            p.put("telefono", partes.length > 2 && !partes[2].isEmpty() ? partes[2] : "Tel-" + endpointId);
            p.put("lugar", partes.length > 3 && !partes[3].isEmpty() ? partes[3] : "Cercano (Bluetooth)");
        } catch (Exception ignored) {
        }
        return p;
    }

    private void iniciarAnuncio() {
        AdvertisingOptions opts = new AdvertisingOptions.Builder().setStrategy(ESTRATEGIA).build();
        client.startAdvertising(nombreEndpointLocal(), SERVICE_ID, lifecycleCallback, opts)
                .addOnSuccessListener(unused -> {
                    Log.i(TAG, "Advertising iniciado: " + nombreEndpointLocal());
                    emitirEstado("anunciando");
                })
                .addOnFailureListener(e -> {
                    Log.e(TAG, "Error advertising: " + e.getMessage());
                    emitirEstado("error-adv:" + e.getMessage());
                });
    }

    private void iniciarBusqueda() {
        DiscoveryOptions opts = new DiscoveryOptions.Builder().setStrategy(ESTRATEGIA).build();
        client.startDiscovery(SERVICE_ID, discoveryCallback, opts)
                .addOnSuccessListener(unused -> {
                    Log.i(TAG, "Discovery iniciado");
                    emitirEstado("buscando");
                })
                .addOnFailureListener(e -> {
                    Log.e(TAG, "Error discovery: " + e.getMessage());
                    emitirEstado("error-disc:" + e.getMessage());
                });
    }

    private final EndpointDiscoveryCallback discoveryCallback = new EndpointDiscoveryCallback() {
        @Override
        public void onEndpointFound(String endpointId, DiscoveredEndpointInfo info) {
            if (!activo) return;
            if (conectados.containsKey(endpointId) || pendientes.containsKey(endpointId)) return;
            JSONObject peer = parsearEndpoint(endpointId, info.getEndpointName());
            String cifRemoto = peer.optString("cif", "");
            String cifLocal = perfilLocal.optString("cif", "");
            if (!cifLocal.isEmpty() && cifLocal.equals(cifRemoto)) return;
            pendientes.put(endpointId, peer);
            client.requestConnection(nombreEndpointLocal(), endpointId, lifecycleCallback)
                    .addOnFailureListener(e -> {
                        pendientes.remove(endpointId);
                        Log.w(TAG, "requestConnection falló para " + endpointId + ": " + e.getMessage());
                    });
        }

        @Override
        public void onEndpointLost(String endpointId) {
            pendientes.remove(endpointId);
        }
    };

    private final ConnectionLifecycleCallback lifecycleCallback = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(String endpointId, ConnectionInfo info) {
            JSONObject peer = parsearEndpoint(endpointId, info.getEndpointName());
            pendientes.put(endpointId, peer);
            client.acceptConnection(endpointId, payloadCallback);
        }

        @Override
        public void onConnectionResult(String endpointId, ConnectionResolution result) {
            JSONObject peer = pendientes.remove(endpointId);
            if (result.getStatus().getStatusCode() == ConnectionsStatusCodes.STATUS_OK) {
                if (peer == null) peer = parsearEndpoint(endpointId, "");
                conectados.put(endpointId, peer);
                enviarHello(endpointId);
                emitirEvento("conectado", "peer", peer);
            }
        }

        @Override
        public void onDisconnected(String endpointId) {
            pendientes.remove(endpointId);
            JSONObject peer = conectados.remove(endpointId);
            if (peer != null) {
                emitirEvento("desconectado", "peer", peer);
            }
        }
    };

    private final PayloadCallback payloadCallback = new PayloadCallback() {
        @Override
        public void onPayloadReceived(String endpointId, Payload payload) {
            if (payload.getType() != Payload.Type.BYTES || payload.asBytes() == null) return;
            String raw = new String(payload.asBytes(), StandardCharsets.UTF_8);
            try {
                JSONObject obj = new JSONObject(raw);
                String tipo = obj.optString("tipo", "mensaje");
                if ("hello".equals(tipo)) {
                    obj.put("endpointId", endpointId);
                    conectados.put(endpointId, obj);
                    emitirEvento("perfil", "peer", obj);
                    return;
                }
                String id = obj.optString("id", "");
                if (!id.isEmpty() && yaVisto(id)) return;
                if (!id.isEmpty()) registrarVisto(id);

                // Agregar nuestro teléfono a la ruta de saltos
                String miTel = perfilLocal.optString("telefono", "");
                JSONArray ruta = obj.optJSONArray("ruta");
                if (ruta == null) ruta = new JSONArray();
                if (!miTel.isEmpty()) {
                    boolean yaEnRuta = false;
                    for (int i = 0; i < ruta.length(); i++) {
                        if (miTel.equals(ruta.optString(i))) { yaEnRuta = true; break; }
                    }
                    if (!yaEnRuta) ruta.put(miTel);
                    obj.put("ruta", ruta);
                }

                // Entregar al WebView
                emitirEvento("paquete", "paquete", obj);

                // Reenvío multi-salto (relay Mesh) si el destino es otro teléfono y queda TTL
                String para = obj.optString("para", "");
                String miCif = perfilLocal.optString("cif", "");
                int ttl = obj.optInt("ttl", 4);
                if (!para.isEmpty() && !para.equals(miCif) && ttl > 1) {
                    obj.put("ttl", ttl - 1);
                    byte[] bytes = obj.toString().getBytes(StandardCharsets.UTF_8);
                    for (String otro : new ArrayList<>(conectados.keySet())) {
                        if (!otro.equals(endpointId)) {
                            client.sendPayload(otro, Payload.fromBytes(bytes));
                        }
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Error procesando payload: " + e.getMessage());
            }
        }

        @Override
        public void onPayloadTransferUpdate(String endpointId, PayloadTransferUpdate update) {
            // Bytes payloads llegan completos en onPayloadReceived.
        }
    };

    private void enviarHello(String endpointId) {
        try {
            JSONObject h = new JSONObject(perfilLocal.toString());
            h.put("tipo", "hello");
            client.sendPayload(endpointId, Payload.fromBytes(h.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ignored) {
        }
    }

    private void enviarHelloATodos() {
        for (String ep : new ArrayList<>(conectados.keySet())) {
            enviarHello(ep);
        }
    }

    private void registrarVisto(String id) {
        synchronized (vistos) {
            vistos.add(id);
            if (vistos.size() > 1000) {
                List<String> copia = new ArrayList<>(vistos);
                vistos.clear();
                vistos.addAll(copia.subList(copia.size() - 500, copia.size()));
            }
        }
    }

    private boolean yaVisto(String id) {
        synchronized (vistos) {
            return vistos.contains(id);
        }
    }

    private void emitirEstado(String estado) {
        try {
            JSONObject ev = new JSONObject();
            ev.put("tipo", "estado");
            ev.put("estado", estado);
            listener.onEvento(ev.toString());
        } catch (Exception ignored) {
        }
    }

    private void emitirEvento(String tipo, String clave, JSONObject dato) {
        try {
            JSONObject ev = new JSONObject();
            ev.put("tipo", tipo);
            ev.put(clave, dato);
            listener.onEvento(ev.toString());
        } catch (Exception ignored) {
        }
    }
}

package ni.edu.uam.unexuam;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
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
 *
 * Protocolo DTN con custodia y purga por acuse (Delivery ACK):
 * - Cada teléfono intermedio guarda el paquete en `custodia` y lo reenvía
 *   automáticamente a nuevos vecinos que entren en rango.
 * - Cuando el destinatario final recibe el mensaje, devuelve un paquete `ack`
 *   que viaja de vuelta al emisor y elimina el mensaje de la `custodia` de
 *   todos los teléfonos intermedios.
 */
public class MeshNativa {
    private static final String TAG = "UnexuamMesh";
    private static final String SERVICE_ID = "ni.edu.uam.unexuam.mesh";
    private static final Strategy ESTRATEGIA = Strategy.P2P_CLUSTER;
    private static final int MAX_CUSTODIA = 200;
    private static final String PREFS_DTN = "unexuam_dtn_v1";

    public interface Listener {
        void onEvento(String eventoJson);
    }

    private final ConnectionsClient client;
    private final SharedPreferences prefs;
    private final Listener listener;
    private final Map<String, JSONObject> conectados = new ConcurrentHashMap<>();
    private final Map<String, JSONObject> pendientes = new ConcurrentHashMap<>();
    private final Map<String, String> custodia = new ConcurrentHashMap<>();
    private final Set<String> vistos = Collections.synchronizedSet(new LinkedHashSet<>());
    private final Set<String> confirmados = Collections.synchronizedSet(new LinkedHashSet<>());

    private volatile JSONObject perfilLocal = new JSONObject();
    private volatile boolean activo = false;

    public MeshNativa(Context context, Listener listener) {
        this.client = Nearby.getConnectionsClient(context);
        this.prefs = context.getSharedPreferences(PREFS_DTN, Context.MODE_PRIVATE);
        this.listener = listener;
        cargarEstadoDtn();
    }

    private void cargarEstadoDtn() {
        try {
            String rawC = prefs.getString("custodia", "{}");
            JSONObject obj = new JSONObject(rawC);
            java.util.Iterator<String> it = obj.keys();
            while (it.hasNext()) {
                String k = it.next();
                custodia.put(k, obj.optString(k));
            }
            String rawOk = prefs.getString("confirmados", "[]");
            JSONArray arr = new JSONArray(rawOk);
            for (int i = 0; i < arr.length(); i++) {
                confirmados.add(arr.optString(i));
            }
        } catch (Exception ignored) {
        }
    }

    private void guardarEstadoDtn() {
        try {
            JSONObject obj = new JSONObject();
            for (Map.Entry<String, String> e : custodia.entrySet()) {
                obj.put(e.getKey(), e.getValue());
            }
            JSONArray arr = new JSONArray();
            synchronized (confirmados) {
                List<String> lista = new ArrayList<>(confirmados);
                int inicio = Math.max(0, lista.size() - 500);
                for (int i = inicio; i < lista.size(); i++) arr.put(lista.get(i));
            }
            prefs.edit()
                    .putString("custodia", obj.toString())
                    .putString("confirmados", arr.toString())
                    .apply();
        } catch (Exception ignored) {
        }
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
            String para = obj.optString("para", "");
            if (!id.isEmpty()) {
                registrarVisto(id);
                // Guardar en custodia hasta recibir ACK (para mensajes 1-a-1)
                if (!"TODOS".equals(para) && !confirmados.contains(id)) {
                    guardarEnCustodia(id, paqueteJson);
                }
            }
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

    private void guardarEnCustodia(String id, String paqueteJson) {
        if (id == null || id.isEmpty() || confirmados.contains(id)) return;
        if (custodia.size() >= MAX_CUSTODIA) {
            String primero = custodia.keySet().iterator().next();
            custodia.remove(primero);
        }
        custodia.put(id, paqueteJson);
        guardarEstadoDtn();
    }

    private void sincronizarCustodiaCon(String endpointId) {
        if (custodia.isEmpty()) return;
        for (String paqueteJson : new ArrayList<>(custodia.values())) {
            client.sendPayload(endpointId, Payload.fromBytes(paqueteJson.getBytes(StandardCharsets.UTF_8)));
        }
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
            if (!cifLocal.isEmpty() && !cifRemoto.isEmpty() && cifLocal.compareTo(cifRemoto) > 0) {
                new Handler(Looper.getMainLooper()).postDelayed(() -> {
                    if (!activo || conectados.containsKey(endpointId) || pendientes.containsKey(endpointId)) return;
                    pendientes.put(endpointId, peer);
                    client.requestConnection(nombreEndpointLocal(), endpointId, lifecycleCallback)
                            .addOnFailureListener(e -> pendientes.remove(endpointId));
                }, 1200);
                return;
            }
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
                // Reenviar todos los mensajes guardados en custodia al nuevo vecino
                sincronizarCustodiaCon(endpointId);
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

                String miCif = perfilLocal.optString("cif", "");
                String miTel = perfilLocal.optString("telefono", "");

                // --- Manejo de ACK de vuelta: purgar custodia en todos los teléfonos intermedios ---
                if ("ack".equals(tipo)) {
                    String ackId = obj.optString("id", "");
                    String ackDe = obj.optString("ackDe", "");
                    if (!ackId.isEmpty() && yaVisto(ackId)) return;
                    if (!ackId.isEmpty()) registrarVisto(ackId);
                    if (!ackDe.isEmpty()) {
                        confirmados.add(ackDe);
                        // Eliminar el mensaje ya entregado de la custodia local
                        boolean purgado = custodia.remove(ackDe) != null;
                        guardarEstadoDtn();
                        if (purgado) {
                            Log.i(TAG, "Mensaje " + ackDe + " eliminado de custodia tras ACK.");
                        }
                    }
                    agregarARuta(obj, "ruta", miTel);
                    String paraAck = obj.optString("para", "");
                    if (paraAck.equals(miCif)) {
                        // El ACK volvió al emisor original: confirmar entrega en el WebView
                        emitirEvento("ack", "ack", obj);
                    } else {
                        // Seguir propagando el ACK de vuelta hacia el emisor y limpiar otros nodos
                        int ttl = obj.optInt("ttl", 6);
                        if (ttl > 1) {
                            obj.put("ttl", ttl - 1);
                            reenviarAOtros(endpointId, obj.toString());
                        }
                    }
                    return;
                }

                // --- Manejo de mensaje normal / broadcast ---
                String id = obj.optString("id", "");
                if (!id.isEmpty() && (yaVisto(id) || confirmados.contains(id))) return;
                if (!id.isEmpty()) registrarVisto(id);

                agregarARuta(obj, "ruta", miTel);
                String para = obj.optString("para", "");
                boolean esParaMi = !miCif.isEmpty() && para.equals(miCif);
                boolean esBroadcast = "TODOS".equals(para);

                if (esParaMi || esBroadcast) {
                    emitirEvento("paquete", "paquete", obj);
                }

                if (esParaMi && !id.isEmpty()) {
                    // Llegó al destinatario final: marcar como confirmado y devolver ACK al emisor
                    confirmados.add(id);
                    custodia.remove(id);
                    guardarEstadoDtn();
                    JSONObject ack = new JSONObject();
                    ack.put("tipo", "ack");
                    ack.put("id", "ack-" + id);
                    ack.put("ackDe", id);
                    ack.put("de", miCif);
                    ack.put("para", obj.optString("de", ""));
                    ack.put("ttl", 6);
                    JSONArray rutaVuelta = new JSONArray();
                    if (!miTel.isEmpty()) rutaVuelta.put(miTel);
                    ack.put("ruta", rutaVuelta);
                    ack.put("rutaEntrega", obj.optJSONArray("ruta"));
                    registrarVisto("ack-" + id);
                    // Enviar ACK por todos los vecinos conectados (encuentra la ruta más corta de vuelta)
                    byte[] ackBytes = ack.toString().getBytes(StandardCharsets.UTF_8);
                    for (String ep : new ArrayList<>(conectados.keySet())) {
                        client.sendPayload(ep, Payload.fromBytes(ackBytes));
                    }
                    return;
                }

                // Si NO es para mí: guardar en custodia (si es 1-a-1) y reenviar si queda TTL
                int ttl = obj.optInt("ttl", 6);
                if (ttl > 1) {
                    obj.put("ttl", ttl - 1);
                    String reenvio = obj.toString();
                    if (!esBroadcast && !id.isEmpty()) {
                        guardarEnCustodia(id, reenvio);
                    }
                    reenviarAOtros(endpointId, reenvio);
                }
            } catch (Exception e) {
                Log.w(TAG, "Error procesando payload: " + e.getMessage());
            }
        }

        @Override
        public void onPayloadTransferUpdate(String endpointId, PayloadTransferUpdate update) {
        }
    };

    private void agregarARuta(JSONObject obj, String clave, String tel) {
        if (tel == null || tel.isEmpty()) return;
        try {
            JSONArray ruta = obj.optJSONArray(clave);
            if (ruta == null) ruta = new JSONArray();
            for (int i = 0; i < ruta.length(); i++) {
                if (tel.equals(ruta.optString(i))) return;
            }
            ruta.put(tel);
            obj.put(clave, ruta);
        } catch (Exception ignored) {
        }
    }

    private void reenviarAOtros(String origenEndpointId, String json) {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        for (String otro : new ArrayList<>(conectados.keySet())) {
            if (!otro.equals(origenEndpointId)) {
                client.sendPayload(otro, Payload.fromBytes(bytes));
            }
        }
    }

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

package ni.edu.uam.unexuam;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
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
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Transporte Mesh real 100% offline sobre Bluetooth / BLE / Wi-Fi Direct
 * usando Google Nearby Connections (Strategy.P2P_CLUSTER).
 *
 * Incluye:
 * - Límite de conexiones simultáneas (MAX_CONECTADOS = 4) y duty-cycling adaptativo.
 * - Custodia DTN con prioridad (incluye SOS e incidentes con TTL temporal) y purga por ACK.
 * - Summary Vector en handshake `hello` para evitar volcado ciego de paquetes repetidos.
 * - Firma HMAC-SHA256 para integridad de paquetes (`mensaje`, `ack`, `incidente`).
 * - Limpieza de `pendientes` zombi (>15 s), guardia MTU (<= 30 KB) y deduplicación persistente.
 */
public class MeshNativa {
    private static final String TAG = "UnexuamMesh";
    private static final String SERVICE_ID = "ni.edu.uam.unexuam.mesh";
    private static final Strategy ESTRATEGIA = Strategy.P2P_CLUSTER;
    private static final int MAX_CUSTODIA = 200;
    private static final int MAX_CONECTADOS = 4;
    private static final int MAX_BYTES_PAYLOAD = 30000;
    private static final long TIMEOUT_PENDIENTE_MS = 15_000L;
    private static final long TTL_BROADCAST_MS = 60L * 60L * 1000L; // 60 min para SOS/bloqueos
    private static final long TTL_DIRECTO_MS = 24L * 60L * 60L * 1000L; // 24 h para 1-a-1
    private static final String PREFS_DTN = "unexuam_dtn_v1";
    private static final byte[] HMAC_KEY = "UNEXUAM-UAM-MESH-INTEGRITY-2026".getBytes(StandardCharsets.UTF_8);

    public interface Listener {
        void onEvento(String eventoJson);
    }

    private static class EntradaCustodia {
        final String json;
        final long expiraMs;
        final boolean prioritario;
        EntradaCustodia(String json, long expiraMs, boolean prioritario) {
            this.json = json;
            this.expiraMs = expiraMs;
            this.prioritario = prioritario;
        }
    }

    private final ConnectionsClient client;
    private final SharedPreferences prefs;
    private final SharedPreferences bandeja;
    private final Listener listener;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Map<String, JSONObject> conectados = new ConcurrentHashMap<>();
    private final Map<String, JSONObject> pendientes = new ConcurrentHashMap<>();
    private final Map<String, Long> pendientesTs = new ConcurrentHashMap<>();
    private final Map<String, EntradaCustodia> custodia = Collections.synchronizedMap(new LinkedHashMap<>());
    private final Set<String> vistos = Collections.synchronizedSet(new LinkedHashSet<>());
    private final Set<String> confirmados = Collections.synchronizedSet(new LinkedHashSet<>());

    private volatile JSONObject perfilLocal = new JSONObject();
    private volatile boolean deseandoActivo = false;
    private volatile boolean anunciando = false;
    private volatile boolean buscando = false;
    private volatile boolean custodiaHabilitada = true;

    public MeshNativa(Context context, Listener listener) {
        this.client = Nearby.getConnectionsClient(context);
        this.prefs = context.getSharedPreferences(PREFS_DTN, Context.MODE_PRIVATE);
        this.bandeja = context.getSharedPreferences("unexuam_entrada_mesh", Context.MODE_PRIVATE);
        this.listener = listener;
        cargarEstadoDtn();
    }

    public void setCustodiaHabilitada(boolean on) {
        this.custodiaHabilitada = on;
    }

    private static String firmar(JSONObject obj) {
        try {
            String base = obj.optString("tipo", "") + "|" + obj.optString("id", "") + "|"
                    + obj.optString("de", "") + "|" + obj.optString("para", "") + "|"
                    + obj.optString("texto", "") + "|" + obj.optString("ackDe", "") + "|"
                    + obj.optString("origen", "") + "|" + obj.optString("destino", "");
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(HMAC_KEY, "HmacSHA256"));
            byte[] h = mac.doFinal(base.getBytes(StandardCharsets.UTF_8));
            return Base64.encodeToString(h, Base64.NO_WRAP);
        } catch (Exception e) {
            Log.w(TAG, "Error firmando paquete: " + e.getMessage());
            return "";
        }
    }

    private static boolean firmaValida(JSONObject obj) {
        String sig = obj.optString("sig", "");
        if (sig.isEmpty()) return false;
        String esperada = firmar(obj);
        return !esperada.isEmpty() && esperada.equals(sig);
    }

    private void cargarEstadoDtn() {
        try {
            long ahora = System.currentTimeMillis();
            String rawC = prefs.getString("custodia_v2", "{}");
            JSONObject obj = new JSONObject(rawC);
            Iterator<String> it = obj.keys();
            while (it.hasNext()) {
                String k = it.next();
                JSONObject item = obj.optJSONObject(k);
                if (item == null) continue;
                long exp = item.optLong("exp", ahora + TTL_DIRECTO_MS);
                if (exp > ahora) {
                    custodia.put(k, new EntradaCustodia(item.optString("json", ""), exp, item.optBoolean("prio", false)));
                }
            }
            JSONArray arrOk = new JSONArray(prefs.getString("confirmados", "[]"));
            for (int i = 0; i < arrOk.length(); i++) confirmados.add(arrOk.optString(i));
            JSONArray arrV = new JSONArray(prefs.getString("vistos", "[]"));
            for (int i = 0; i < arrV.length(); i++) vistos.add(arrV.optString(i));
        } catch (Exception e) {
            Log.w(TAG, "Error cargando estado DTN: " + e.getMessage());
        }
    }

    private void guardarEstadoDtn() {
        try {
            long ahora = System.currentTimeMillis();
            JSONObject obj = new JSONObject();
            synchronized (custodia) {
                Iterator<Map.Entry<String, EntradaCustodia>> it = custodia.entrySet().iterator();
                while (it.hasNext()) {
                    Map.Entry<String, EntradaCustodia> e = it.next();
                    if (e.getValue().expiraMs <= ahora) { it.remove(); continue; }
                    JSONObject item = new JSONObject();
                    item.put("json", e.getValue().json);
                    item.put("exp", e.getValue().expiraMs);
                    item.put("prio", e.getValue().prioritario);
                    obj.put(e.getKey(), item);
                }
            }
            JSONArray arrOk = new JSONArray();
            synchronized (confirmados) {
                List<String> lista = new ArrayList<>(confirmados);
                for (int i = Math.max(0, lista.size() - 500); i < lista.size(); i++) arrOk.put(lista.get(i));
            }
            JSONArray arrV = new JSONArray();
            synchronized (vistos) {
                List<String> lista = new ArrayList<>(vistos);
                for (int i = Math.max(0, lista.size() - 800); i < lista.size(); i++) arrV.put(lista.get(i));
            }
            prefs.edit()
                    .putString("custodia_v2", obj.toString())
                    .putString("confirmados", arrOk.toString())
                    .putString("vistos", arrV.toString())
                    .apply();
        } catch (Exception e) {
            Log.w(TAG, "Error guardando estado DTN: " + e.getMessage());
        }
    }

    public synchronized void iniciar(String perfilJson) {
        try {
            perfilLocal = new JSONObject(perfilJson);
        } catch (Exception e) {
            Log.w(TAG, "Perfil JSON inválido: " + e.getMessage());
            perfilLocal = new JSONObject();
        }
        deseandoActivo = true;
        recuperarEntradas();
        if (anunciando && buscando) {
            enviarHelloATodos();
            return;
        }
        if (!anunciando) iniciarAnuncio();
        if (!buscando && conectados.size() < MAX_CONECTADOS) iniciarBusqueda();
    }

    public synchronized void reintentarSiNecesario() {
        if (!deseandoActivo) return;
        if (!anunciando) iniciarAnuncio();
        if (!buscando && conectados.size() < MAX_CONECTADOS) iniciarBusqueda();
    }

    public synchronized void actualizarPerfil(String perfilJson) {
        try {
            perfilLocal = new JSONObject(perfilJson);
        } catch (Exception e) {
            Log.w(TAG, "Error actualizando perfil: " + e.getMessage());
        }
        if (deseandoActivo) enviarHelloATodos();
    }

    public synchronized void detener() {
        deseandoActivo = false;
        anunciando = false;
        buscando = false;
        try {
            client.stopAdvertising();
            client.stopDiscovery();
            client.stopAllEndpoints();
        } catch (Exception e) {
            Log.w(TAG, "Error deteniendo Nearby: " + e.getMessage());
        }
        conectados.clear();
        pendientes.clear();
        pendientesTs.clear();
    }

    public synchronized int enviarPaquete(String paqueteJson) {
        String firmado = paqueteJson;
        try {
            JSONObject obj = new JSONObject(paqueteJson);
            if (obj.optString("sig", "").isEmpty()) {
                obj.put("sig", firmar(obj));
            }
            firmado = obj.toString();
            if (firmado.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES_PAYLOAD) return -1;
            String id = obj.optString("id", "");
            String para = obj.optString("para", "");
            String tipo = obj.optString("tipo", "mensaje");
            String txt = obj.optString("texto", "");
            boolean esPrioritario = "incidente".equals(tipo) || txt.startsWith("SOS");
            boolean esBroadcast = "TODOS".equals(para);
            if (!id.isEmpty()) {
                registrarVisto(id);
                if (custodiaHabilitada && !confirmados.contains(id)) {
                    guardarEnCustodia(id, firmado, esPrioritario, esBroadcast ? TTL_BROADCAST_MS : TTL_DIRECTO_MS);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Error preparando paquete saliente", e);
            return -1;
        }
        if (conectados.isEmpty()) return 0;
        byte[] bytes = firmado.getBytes(StandardCharsets.UTF_8);
        int enviados = 0;
        for (String endpointId : new ArrayList<>(conectados.keySet())) {
            enviarSeguro(endpointId, bytes);
            enviados++;
        }
        return enviados;
    }

    private void enviarSeguro(String endpointId, byte[] bytes) {
        if (bytes == null || bytes.length > MAX_BYTES_PAYLOAD) return;
        client.sendPayload(endpointId, Payload.fromBytes(bytes))
                .addOnFailureListener(e -> Log.w(TAG, "sendPayload falló hacia " + endpointId + ": " + e.getMessage()));
    }

    public String vecinosJson() {
        JSONArray arr = new JSONArray();
        for (JSONObject peer : conectados.values()) arr.put(peer);
        return arr.toString();
    }

    private void guardarEnCustodia(String id, String paqueteJson, boolean prioritario, long ttlMs) {
        if (!custodiaHabilitada || id == null || id.isEmpty() || confirmados.contains(id)) return;
        synchronized (custodia) {
            EntradaCustodia existente = custodia.get(id);
            if (existente != null && existente.expiraMs > System.currentTimeMillis()) return;
            Iterator<EntradaCustodia> caducadas = custodia.values().iterator();
            long ahora = System.currentTimeMillis();
            while (caducadas.hasNext()) {
                if (caducadas.next().expiraMs <= ahora) caducadas.remove();
            }
            if (custodia.size() >= MAX_CUSTODIA) {
                // Desalojar el paquete NO prioritario más antiguo primero (FIFO determinístico)
                String victima = null;
                for (Map.Entry<String, EntradaCustodia> e : custodia.entrySet()) {
                    if (!e.getValue().prioritario) { victima = e.getKey(); break; }
                }
                if (victima == null && !custodia.isEmpty()) victima = custodia.keySet().iterator().next();
                if (victima != null) custodia.remove(victima);
            }
            custodia.put(id, new EntradaCustodia(paqueteJson, System.currentTimeMillis() + ttlMs, prioritario));
        }
        guardarEstadoDtn();
    }

    private void sincronizarCustodiaFaltante(String endpointId, Set<String> remotoTiene) {
        List<String> faltantes = new ArrayList<>();
        long ahora = System.currentTimeMillis();
        synchronized (custodia) {
            for (Map.Entry<String, EntradaCustodia> e : custodia.entrySet()) {
                if (e.getValue().expiraMs > ahora && !remotoTiene.contains(e.getKey())) {
                    faltantes.add(e.getValue().json);
                }
            }
        }
        if (faltantes.isEmpty()) return;
        // Enviar con pacing suave (35 ms entre paquetes) para no saturar buffers BLE/Wi-Fi Direct
        for (int i = 0; i < faltantes.size(); i++) {
            final byte[] bytes = faltantes.get(i).getBytes(StandardCharsets.UTF_8);
            mainHandler.postDelayed(() -> {
                if (conectados.containsKey(endpointId)) enviarSeguro(endpointId, bytes);
            }, i * 35L);
        }
    }

    private String nombreEndpointLocal() {
        // Solo CIF en endpointName (sin PII ni caracteres '|' frágiles)
        String cif = perfilLocal.optString("cif", "ANON").replace("|", "");
        return cif.length() > 15 ? cif.substring(0, 15) : cif;
    }

    private JSONObject parsearEndpoint(String endpointId, String nombreEndpoint) {
        JSONObject p = new JSONObject();
        try {
            String cif = (nombreEndpoint != null && !nombreEndpoint.trim().isEmpty())
                    ? nombreEndpoint.split("\\|", -1)[0].trim() : "PEER-" + endpointId;
            p.put("endpointId", endpointId);
            p.put("cif", cif);
            p.put("nombre", "Teléfono cercano");
            p.put("telefono", "Tel-" + cif);
            p.put("lugar", "Cercano (Mesh)");
        } catch (Exception e) {
            Log.w(TAG, "Error parseando endpoint: " + e.getMessage());
        }
        return p;
    }

    private void purgarPendientesVencidos() {
        long ahora = System.currentTimeMillis();
        for (Map.Entry<String, Long> e : new ArrayList<>(pendientesTs.entrySet())) {
            if (ahora - e.getValue() > TIMEOUT_PENDIENTE_MS) {
                pendientes.remove(e.getKey());
                pendientesTs.remove(e.getKey());
            }
        }
    }

    private void iniciarAnuncio() {
        AdvertisingOptions opts = new AdvertisingOptions.Builder().setStrategy(ESTRATEGIA).build();
        client.startAdvertising(nombreEndpointLocal(), SERVICE_ID, lifecycleCallback, opts)
                .addOnSuccessListener(unused -> {
                    anunciando = true;
                    Log.i(TAG, "Advertising iniciado");
                    emitirEstado("anunciando");
                })
                .addOnFailureListener(e -> {
                    anunciando = false;
                    Log.e(TAG, "Error advertising: " + e.getMessage());
                    emitirEstado("error-adv:" + e.getMessage());
                });
    }

    private void iniciarBusqueda() {
        if (conectados.size() >= MAX_CONECTADOS) return;
        DiscoveryOptions opts = new DiscoveryOptions.Builder().setStrategy(ESTRATEGIA).build();
        client.startDiscovery(SERVICE_ID, discoveryCallback, opts)
                .addOnSuccessListener(unused -> {
                    buscando = true;
                    Log.i(TAG, "Discovery iniciado");
                    emitirEstado("buscando");
                })
                .addOnFailureListener(e -> {
                    buscando = false;
                    Log.e(TAG, "Error discovery: " + e.getMessage());
                    emitirEstado("error-disc:" + e.getMessage());
                });
    }

    private void ajustarDutyCycle() {
        if (!deseandoActivo) return;
        if (conectados.size() >= MAX_CONECTADOS && buscando) {
            try { client.stopDiscovery(); } catch (Exception ignored) {}
            buscando = false;
        } else if (conectados.size() < MAX_CONECTADOS && !buscando) {
            iniciarBusqueda();
        }
    }

    private final EndpointDiscoveryCallback discoveryCallback = new EndpointDiscoveryCallback() {
        @Override
        public void onEndpointFound(String endpointId, DiscoveredEndpointInfo info) {
            if (!deseandoActivo) return;
            purgarPendientesVencidos();
            if (conectados.size() >= MAX_CONECTADOS) return;
            if (conectados.containsKey(endpointId) || pendientes.containsKey(endpointId)) return;
            JSONObject peer = parsearEndpoint(endpointId, info.getEndpointName());
            String cifRemoto = peer.optString("cif", "");
            String cifLocal = perfilLocal.optString("cif", "");
            if (!cifLocal.isEmpty() && cifLocal.equals(cifRemoto)) return;
            for (JSONObject c : conectados.values()) {
                if (!cifRemoto.isEmpty() && cifRemoto.equals(c.optString("cif", ""))) return;
            }
            if (!cifLocal.isEmpty() && !cifRemoto.isEmpty() && cifLocal.compareTo(cifRemoto) > 0) {
                mainHandler.postDelayed(() -> {
                    if (!deseandoActivo || conectados.size() >= MAX_CONECTADOS
                            || conectados.containsKey(endpointId) || pendientes.containsKey(endpointId)) return;
                    pendientes.put(endpointId, peer);
                    pendientesTs.put(endpointId, System.currentTimeMillis());
                    client.requestConnection(nombreEndpointLocal(), endpointId, lifecycleCallback)
                            .addOnFailureListener(e -> { pendientes.remove(endpointId); pendientesTs.remove(endpointId); });
                }, 1200);
                return;
            }
            pendientes.put(endpointId, peer);
            pendientesTs.put(endpointId, System.currentTimeMillis());
            client.requestConnection(nombreEndpointLocal(), endpointId, lifecycleCallback)
                    .addOnFailureListener(e -> {
                        pendientes.remove(endpointId);
                        pendientesTs.remove(endpointId);
                        Log.w(TAG, "requestConnection falló para " + endpointId + ": " + e.getMessage());
                    });
        }

        @Override
        public void onEndpointLost(String endpointId) {
            pendientes.remove(endpointId);
            pendientesTs.remove(endpointId);
        }
    };

    private final ConnectionLifecycleCallback lifecycleCallback = new ConnectionLifecycleCallback() {
        @Override
        public void onConnectionInitiated(String endpointId, ConnectionInfo info) {
            if (conectados.size() >= MAX_CONECTADOS) {
                client.rejectConnection(endpointId);
                return;
            }
            JSONObject peer = parsearEndpoint(endpointId, info.getEndpointName());
            pendientes.put(endpointId, peer);
            pendientesTs.put(endpointId, System.currentTimeMillis());
            client.acceptConnection(endpointId, payloadCallback)
                    .addOnFailureListener(e -> {
                        pendientes.remove(endpointId);
                        pendientesTs.remove(endpointId);
                        Log.w(TAG, "acceptConnection falló: " + e.getMessage());
                    });
        }

        @Override
        public void onConnectionResult(String endpointId, ConnectionResolution result) {
            JSONObject peer = pendientes.remove(endpointId);
            pendientesTs.remove(endpointId);
            if (result.getStatus().getStatusCode() == ConnectionsStatusCodes.STATUS_OK) {
                if (peer == null) peer = parsearEndpoint(endpointId, "");
                // Deduplicar por CIF si el vecino reconectó con otro endpointId
                String cifNuevo = peer.optString("cif", "");
                if (!cifNuevo.isEmpty()) {
                    for (Map.Entry<String, JSONObject> e : new ArrayList<>(conectados.entrySet())) {
                        if (!e.getKey().equals(endpointId) && cifNuevo.equals(e.getValue().optString("cif", ""))) {
                            conectados.remove(e.getKey());
                            try { client.disconnectFromEndpoint(e.getKey()); } catch (Exception ignored) {}
                        }
                    }
                }
                conectados.put(endpointId, peer);
                enviarHello(endpointId);
                emitirEvento("conectado", "peer", peer);
                ajustarDutyCycle();
            }
        }

        @Override
        public void onDisconnected(String endpointId) {
            pendientes.remove(endpointId);
            pendientesTs.remove(endpointId);
            JSONObject peer = conectados.remove(endpointId);
            if (peer != null) emitirEvento("desconectado", "peer", peer);
            ajustarDutyCycle();
        }
    };

    private final PayloadCallback payloadCallback = new PayloadCallback() {
        @Override
        public void onPayloadReceived(String endpointId, Payload payload) {
            if (payload.getType() != Payload.Type.BYTES) return;
            byte[] bytes = payload.asBytes();
            if (bytes == null || bytes.length > MAX_BYTES_PAYLOAD) return;
            String raw = new String(bytes, StandardCharsets.UTF_8);
            try {
                JSONObject obj = new JSONObject(raw);
                String tipo = obj.optString("tipo");
                if ("hello".equals(tipo)) {
                    JSONArray sv = obj.optJSONArray("tengo");
                    if (!conectados.containsKey(endpointId) || sv == null || sv.length() > 400) return;
                    obj.put("endpointId", endpointId);
                    conectados.put(endpointId, obj);
                    emitirEvento("perfil", "peer", obj);
                    // Summary Vector: solo enviar paquetes que el vecino NO tiene
                    Set<String> remotoTiene = new HashSet<>();
                    for (int i = 0; i < sv.length(); i++) remotoTiene.add(sv.optString(i));
                    sincronizarCustodiaFaltante(endpointId, remotoTiene);
                    return;
                }

                if (!"mensaje".equals(tipo) && !"incidente".equals(tipo) && !"ack".equals(tipo)) return;
                String id = obj.optString("id");
                int saltos = obj.optInt("ttl", 0);
                if (id.isEmpty() || id.length() > 80 || saltos < 1 || saltos > 10) return;

                // Verificar integridad HMAC-SHA256 para rechazar paquetes forjados/manipulados
                if (!firmaValida(obj)) {
                    Log.w(TAG, "Paquete rechazado por firma inválida desde " + endpointId);
                    return;
                }

                String miCif = perfilLocal.optString("cif", "");
                String miTel = perfilLocal.optString("telefono", "");

                if ("ack".equals(tipo)) {
                    String ackId = obj.optString("id", "");
                    String ackDe = obj.optString("ackDe", "");
                    if (ackDe.isEmpty() || !ackId.equals("ack-" + ackDe) || yaVisto(ackId)) return;
                    EntradaCustodia original = custodia.get(ackDe);
                    if (original != null) {
                        JSONObject mensaje = new JSONObject(original.json);
                        if (!mensaje.optString("para").equals(obj.optString("de"))
                                || !mensaje.optString("de").equals(obj.optString("para"))) return;
                    }
                    boolean esAcuseLocal = obj.optString("para").equals(miCif);
                    if (esAcuseLocal && !guardarEntrada(ackId, obj)) return;
                    registrarVisto(ackId);
                    if (!ackDe.isEmpty()) {
                        registrarConfirmado(ackDe);
                        custodia.remove(ackDe);
                        guardarEstadoDtn();
                    }
                    agregarARuta(obj, "ruta", miTel);
                    if (esAcuseLocal) {
                        emitirEvento("ack", "ack", obj);
                    } else {
                        int ttl = obj.optInt("ttl", 6);
                        if (ttl > 1) {
                            obj.put("ttl", ttl - 1);
                            guardarEnCustodia(ackId, obj.toString(), true, TTL_DIRECTO_MS);
                            reenviarAOtros(endpointId, obj.toString());
                        }
                    }
                    return;
                }

                String para = obj.optString("para");
                boolean esParaMi = !miCif.isEmpty() && para.equals(miCif);
                if (esParaMi) {
                    EntradaCustodia recibo = custodia.get("ack-" + id);
                    if (recibo != null && recibo.expiraMs > System.currentTimeMillis()) {
                        enviarSeguro(endpointId, recibo.json.getBytes(StandardCharsets.UTF_8));
                        return;
                    }
                    agregarARuta(obj, "ruta", miTel);
                    aceptarEntrada(id, obj);
                    return;
                }
                if (yaVisto(id) || confirmados.contains(id)) return;
                registrarVisto(id);
                agregarARuta(obj, "ruta", miTel);
                boolean esBroadcast = "TODOS".equals(para);
                boolean esPrioritario = "incidente".equals(tipo) || obj.optString("texto", "").startsWith("SOS");
                if (esBroadcast) emitirEvento("paquete", "paquete", obj);

                int ttl = obj.optInt("ttl", 6);
                if (ttl > 1) {
                    obj.put("ttl", ttl - 1);
                    String reenvio = obj.toString();
                    if (!id.isEmpty() && custodiaHabilitada) {
                        guardarEnCustodia(id, reenvio, esPrioritario, esBroadcast ? TTL_BROADCAST_MS : TTL_DIRECTO_MS);
                    }
                    reenviarAOtros(endpointId, reenvio);
                }
            } catch (Exception e) {
                Log.w(TAG, "Error procesando payload: " + e.getMessage());
            }
        }

        @Override
        public void onPayloadTransferUpdate(String endpointId, PayloadTransferUpdate update) {
            if (update.getStatus() == PayloadTransferUpdate.Status.FAILURE) {
                Log.w(TAG, "Transferencia fallida con " + endpointId + " (payloadId=" + update.getPayloadId() + ")");
            }
        }
    };

    private synchronized void aceptarEntrada(String id, JSONObject paquete) {
        if (guardarEntrada(id, paquete)) {
            emitirEvento("paquete", "paquete", paquete);
        }
    }

    private synchronized boolean guardarEntrada(String id, JSONObject paquete) {
        if (bandeja.getAll().size() >= MAX_CUSTODIA && !bandeja.contains(id)) return false;
        return bandeja.edit().putString(id, paquete.toString()).commit();
    }

    private void registrarConfirmado(String id) {
        synchronized (confirmados) {
            confirmados.add(id);
            while (confirmados.size() > 500) {
                Iterator<String> antiguos = confirmados.iterator();
                antiguos.next();
                antiguos.remove();
            }
        }
    }

    private synchronized void recuperarEntradas() {
        for (Object valor : bandeja.getAll().values()) {
            if (!(valor instanceof String)) continue;
            try {
                JSONObject paquete = new JSONObject((String) valor);
                if (perfilLocal.optString("cif").equals(paquete.optString("para"))) {
                    String evento = "ack".equals(paquete.optString("tipo")) ? "ack" : "paquete";
                    emitirEvento(evento, evento, paquete);
                }
            } catch (Exception e) {
                Log.w(TAG, "Entrada Mesh inválida", e);
            }
        }
    }

    public synchronized void confirmarEntrada(String id) {
        String datos = bandeja.getString(id, null);
        if (datos == null) return;
        try {
            JSONObject paquete = new JSONObject(datos);
            String miCif = perfilLocal.optString("cif");
            if (miCif.isEmpty() || !miCif.equals(paquete.optString("para"))) return;
            if ("ack".equals(paquete.optString("tipo"))) {
                bandeja.edit().remove(id).apply();
                return;
            }
            JSONObject ack = new JSONObject();
            String ackId = "ack-" + id;
            ack.put("tipo", "ack");
            ack.put("id", ackId);
            ack.put("ackDe", id);
            ack.put("de", miCif);
            ack.put("para", paquete.optString("de"));
            ack.put("ttl", 6);
            ack.put("ruta", new JSONArray().put(perfilLocal.optString("telefono")));
            ack.put("rutaEntrega", paquete.optJSONArray("ruta"));
            ack.put("sig", firmar(ack));
            guardarEnCustodia(ackId, ack.toString(), true, TTL_DIRECTO_MS);
            registrarVisto(ackId);
            reenviarAOtros(null, ack.toString());
            bandeja.edit().remove(id).apply();
        } catch (Exception e) {
            Log.w(TAG, "Error confirmando la entrada Mesh", e);
        }
    }

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
        } catch (Exception e) {
            Log.w(TAG, "Error agregando a ruta: " + e.getMessage());
        }
    }

    private void reenviarAOtros(String origenEndpointId, String json) {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        for (String otro : new ArrayList<>(conectados.keySet())) {
            if (!otro.equals(origenEndpointId)) enviarSeguro(otro, bytes);
        }
    }

    private void enviarHello(String endpointId) {
        try {
            JSONObject h = new JSONObject(perfilLocal.toString());
            h.put("tipo", "hello");
            JSONArray tengo = new JSONArray();
            synchronized (custodia) {
                for (String k : custodia.keySet()) tengo.put(k);
            }
            synchronized (confirmados) {
                List<String> ok = new ArrayList<>(confirmados);
                for (int i = Math.max(0, ok.size() - 200); i < ok.size(); i++) tengo.put(ok.get(i));
            }
            h.put("tengo", tengo);
            enviarSeguro(endpointId, h.toString().getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            Log.w(TAG, "Error enviando hello: " + e.getMessage());
        }
    }

    private void enviarHelloATodos() {
        for (String ep : new ArrayList<>(conectados.keySet())) enviarHello(ep);
    }

    private void registrarVisto(String id) {
        synchronized (vistos) {
            vistos.add(id);
            if (vistos.size() > 1000) {
                List<String> copia = new ArrayList<>(vistos);
                vistos.clear();
                vistos.addAll(copia.subList(copia.size() - 600, copia.size()));
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
        } catch (Exception e) {
            Log.w(TAG, "Error emitiendo estado: " + e.getMessage());
        }
    }

    private void emitirEvento(String tipo, String clave, JSONObject dato) {
        try {
            JSONObject ev = new JSONObject();
            ev.put("tipo", tipo);
            ev.put(clave, dato);
            listener.onEvento(ev.toString());
        } catch (Exception e) {
            Log.w(TAG, "Error emitiendo evento: " + e.getMessage());
        }
    }
}

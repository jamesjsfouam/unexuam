package ni.edu.uam.unexuam;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final int REQ_PERMISOS = 1042;
    private static final int REQ_BT_ENABLE = 1043;
    private static final String CANAL_EMERGENCIAS = "unexuam_emergencias";
    private static final String CANAL_MENSAJES = "unexuam_mensajes";
    private final AtomicInteger notifSeq = new AtomicInteger(200);
    private boolean btPromptLanzado = false;
    private MeshNativa meshNativa;
    private String ultimoPerfilMesh = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        crearCanalesNotificacion();
        meshNativa = new MeshNativa(this, this::enviarEventoAWeb);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().addJavascriptInterface(new PuenteNativo(), "UnexuamNativo");
            this.bridge.getWebView().reload();
        }
        solicitarPermisosEntrada();
    }

    private void crearCanalesNotificacion() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel chEmerg = new NotificationChannel(
                CANAL_EMERGENCIAS,
                "Alertas SOS y bloqueos",
                NotificationManager.IMPORTANCE_HIGH);
        chEmerg.setDescription("Notificaciones urgentes de SOS y pasillos bloqueados por red Mesh");
        chEmerg.enableVibration(true);
        chEmerg.setVibrationPattern(new long[]{0, 260, 120, 260, 120, 380});
        nm.createNotificationChannel(chEmerg);

        NotificationChannel chMsg = new NotificationChannel(
                CANAL_MENSAJES,
                "Mensajes Mesh Off-Grid",
                NotificationManager.IMPORTANCE_DEFAULT);
        chMsg.setDescription("Mensajes recibidos de teléfonos cercanos sin internet");
        nm.createNotificationChannel(chMsg);
    }

    @SuppressLint("MissingPermission")
    public void mostrarNotificacionNativa(String titulo, String cuerpo, String tipo) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                    && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                return;
            }
            boolean urgente = "sos".equalsIgnoreCase(tipo) || "bloqueo".equalsIgnoreCase(tipo);
            String canal = urgente ? CANAL_EMERGENCIAS : CANAL_MENSAJES;
            Intent intent = new Intent(this, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(
                    this, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            NotificationCompat.Builder b = new NotificationCompat.Builder(this, canal)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(titulo != null && !titulo.isEmpty() ? titulo : "Unexuam")
                    .setContentText(cuerpo != null ? cuerpo : "")
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(cuerpo != null ? cuerpo : ""))
                    .setPriority(urgente ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT)
                    .setCategory(urgente ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_MESSAGE)
                    .setAutoCancel(true)
                    .setContentIntent(pi);
            NotificationManagerCompat.from(this).notify(notifSeq.incrementAndGet(), b.build());
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onDestroy() {
        if (meshNativa != null) meshNativa.detener();
        super.onDestroy();
    }

    private void enviarEventoAWeb(String eventoJson) {
        try {
            JSONObject ev = new JSONObject(eventoJson);
            String tipo = ev.optString("tipo", "");
            if ("paquete".equals(tipo)) {
                JSONObject pq = ev.optJSONObject("paquete");
                if (pq != null) {
                    String txt = pq.optString("texto", "");
                    String de = pq.optString("deNombre", pq.optString("de", "Unexuam"));
                    boolean esSos = txt.startsWith("SOS");
                    mostrarNotificacionNativa(esSos ? "ALERTA SOS · " + de : "Mensaje de " + de, txt, esSos ? "sos" : "mensaje");
                }
            } else if ("incidente".equals(tipo) || ev.optBoolean("recalcularRuta", false)) {
                mostrarNotificacionNativa("Pasillo bloqueado en campus", "Tu ruta de evacuación fue recalculada automáticamente.", "bloqueo");
            }
        } catch (Exception ignored) {
        }
        runOnUiThread(() -> {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                String js = "window.__unexuamMeshEvento && window.__unexuamMeshEvento(" + JSONObject.quote(eventoJson) + ");";
                this.bridge.getWebView().evaluateJavascript(js, null);
            }
        });
    }

    private String[] permisosRequeridos() {
        List<String> lista = new ArrayList<>();
        lista.add(Manifest.permission.ACCESS_FINE_LOCATION);
        lista.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            lista.add(Manifest.permission.BLUETOOTH_SCAN);
            lista.add(Manifest.permission.BLUETOOTH_CONNECT);
            lista.add(Manifest.permission.BLUETOOTH_ADVERTISE);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            lista.add(Manifest.permission.NEARBY_WIFI_DEVICES);
            lista.add(Manifest.permission.POST_NOTIFICATIONS);
        }
        return lista.toArray(new String[0]);
    }

    private boolean tienePermisosMesh() {
        boolean loc = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
                || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        if (!loc) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN)
                    != PackageManager.PERMISSION_GRANTED) return false;
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                    != PackageManager.PERMISSION_GRANTED) return false;
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_ADVERTISE)
                    != PackageManager.PERMISSION_GRANTED) return false;
        }
        return true;
    }

    private void solicitarPermisosEntrada() {
        List<String> faltantes = new ArrayList<>();
        for (String p : permisosRequeridos()) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                faltantes.add(p);
            }
        }
        if (!faltantes.isEmpty()) {
            ActivityCompat.requestPermissions(this, faltantes.toArray(new String[0]), REQ_PERMISOS);
        } else {
            pedirActivarBluetoothSiApagado();
            if (ultimoPerfilMesh != null) meshNativa.iniciar(ultimoPerfilMesh);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERMISOS) {
            pedirActivarBluetoothSiApagado();
            if (ultimoPerfilMesh != null && tienePermisosMesh()) {
                meshNativa.iniciar(ultimoPerfilMesh);
            }
        }
    }

    @SuppressLint("MissingPermission")
    private void pedirActivarBluetoothSiApagado() {
        if (btPromptLanzado) return;
        BluetoothAdapter adapter = obtenerBluetoothAdapter();
        if (adapter == null || adapter.isEnabled()) return;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        btPromptLanzado = true;
        try {
            startActivityForResult(new Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE), REQ_BT_ENABLE);
        } catch (Exception ignored) {
        }
    }

    private BluetoothAdapter obtenerBluetoothAdapter() {
        BluetoothManager bm = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        if (bm != null && bm.getAdapter() != null) return bm.getAdapter();
        return BluetoothAdapter.getDefaultAdapter();
    }

    private class PuenteNativo {
        @JavascriptInterface
        public void pedirPermisos() {
            runOnUiThread(() -> {
                btPromptLanzado = false;
                solicitarPermisosEntrada();
            });
        }

        @JavascriptInterface
        public void iniciarMesh(String perfilJson) {
            ultimoPerfilMesh = perfilJson;
            runOnUiThread(() -> {
                if (tienePermisosMesh()) {
                    meshNativa.iniciar(perfilJson);
                } else {
                    solicitarPermisosEntrada();
                }
            });
        }

        @JavascriptInterface
        public void actualizarPerfilMesh(String perfilJson) {
            ultimoPerfilMesh = perfilJson;
            runOnUiThread(() -> meshNativa.actualizarPerfil(perfilJson));
        }

        @JavascriptInterface
        public void detenerMesh() {
            ultimoPerfilMesh = null;
            runOnUiThread(() -> meshNativa.detener());
        }

        @JavascriptInterface
        public int enviarPaqueteMesh(String paqueteJson) {
            return meshNativa != null ? meshNativa.enviarPaquete(paqueteJson) : 0;
        }

        @JavascriptInterface
        public String vecinosMeshReales() {
            return meshNativa != null ? meshNativa.vecinosJson() : "[]";
        }

        @JavascriptInterface
        @SuppressLint("MissingPermission")
        public void vibrarAlerta() {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v == null || !v.hasVibrator()) return;
                long[] patron = {0, 260, 120, 260, 120, 380};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createWaveform(patron, -1));
                } else {
                    v.vibrate(patron, -1);
                }
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void notificar(String titulo, String cuerpo, String tipo) {
            runOnUiThread(() -> mostrarNotificacionNativa(titulo, cuerpo, tipo));
        }

        @JavascriptInterface
        public String estadoBluetooth() {
            BluetoothAdapter adapter = obtenerBluetoothAdapter();
            if (adapter == null) return "no-disponible";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                    && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.BLUETOOTH_CONNECT)
                    != PackageManager.PERMISSION_GRANTED) {
                return "sin-permiso";
            }
            return adapter.isEnabled() ? "encendido" : "apagado";
        }

        @JavascriptInterface
        @SuppressLint("MissingPermission")
        public String ubicacionNativa() {
            boolean fine = ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;
            boolean coarse = ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_COARSE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;
            if (!fine && !coarse) return "";
            try {
                LocationManager lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
                if (lm == null) return "";
                Location mejor = null;
                for (String prov : lm.getProviders(true)) {
                    Location loc = lm.getLastKnownLocation(prov);
                    if (loc == null) continue;
                    if (mejor == null || loc.getAccuracy() < mejor.getAccuracy()) {
                        mejor = loc;
                    }
                }
                if (mejor == null) return "";
                return String.format(Locale.US, "{\"lat\":%.7f,\"lon\":%.7f,\"acc\":%.1f}",
                        mejor.getLatitude(), mejor.getLongitude(), mejor.getAccuracy());
            } catch (Exception e) {
                return "";
            }
        }
    }
}

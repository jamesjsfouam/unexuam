package ni.edu.uam.unexuam;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.widget.FrameLayout;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;
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
    private boolean btReceiverRegistrado = false;
    private volatile boolean enPrimerPlano = false;
    private MeshNativa meshNativa;
    private final MeshNativa.Listener meshUiListener = this::enviarEventoAWeb;
    private String ultimoPerfilMesh = null;
    private TextToSpeech tts;
    private volatile boolean ttsListo = false;

    private final BroadcastReceiver btReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (BluetoothAdapter.ACTION_STATE_CHANGED.equals(intent.getAction())) {
                int estado = intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, BluetoothAdapter.ERROR);
                if (estado == BluetoothAdapter.STATE_ON && meshNativa != null && tienePermisosMesh()) {
                    meshNativa.reintentarSiNecesario();
                    if (ultimoPerfilMesh != null) meshNativa.iniciar(ultimoPerfilMesh);
                    enviarEventoAWeb("{\"tipo\":\"estado\",\"estado\":\"bluetooth-encendido\"}");
                } else if (estado == BluetoothAdapter.STATE_OFF || estado == BluetoothAdapter.STATE_TURNING_OFF) {
                    enviarEventoAWeb("{\"tipo\":\"estado\",\"estado\":\"bluetooth-apagado\"}");
                }
            }
        }
    };

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ViewGroup raiz = findViewById(android.R.id.content);
        if (raiz != null) {
            SplashNativoView splash = new SplashNativoView(this);
            raiz.addView(splash, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT));
            splash.iniciar();
        }
        crearCanalesNotificacion();
        iniciarTts();
        meshNativa = MeshForegroundService.obtenerMesh(this);
        MeshForegroundService.adjuntarListener(meshUiListener);
        ultimoPerfilMesh = MeshForegroundService.obtenerPerfilGuardado(this);
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().setBackgroundColor(0xFF0080FF);
            this.bridge.getWebView().addJavascriptInterface(new PuenteNativo(), "UnexuamNativo");
        }
        try {
            registerReceiver(btReceiver, new IntentFilter(BluetoothAdapter.ACTION_STATE_CHANGED));
            btReceiverRegistrado = true;
        } catch (Exception e) {
            Log.w("UnexuamMain", "No se pudo registrar btReceiver: " + e.getMessage());
        }
        solicitarPermisosEntrada();
        procesarIntentRuta(getIntent());
        try {
            FirebaseMessaging.getInstance().subscribeToTopic("campus_emergencias")
                    .addOnFailureListener(e -> Log.w("UnexuamMain", "No se pudo suscribir al canal de campus.", e));
        } catch (Exception e) {
            Log.w("UnexuamMain", "FCM topic diferido sin red: " + e.getMessage());
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        enPrimerPlano = true;
        MeshForegroundService.adjuntarListener(meshUiListener);
        if (meshNativa != null) {
            meshNativa.recuperarEntradas();
        }
    }

    @Override
    public void onPause() {
        enPrimerPlano = false;
        super.onPause();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        procesarIntentRuta(intent);
    }

    private void procesarIntentRuta(Intent intent) {
        if (intent != null && intent.getBooleanExtra("ir_a_campus", false)) {
            intent.removeExtra("ir_a_campus");
            runOnUiThread(() -> {
                if (this.bridge != null && this.bridge.getWebView() != null) {
                    this.bridge.getWebView().evaluateJavascript(
                            "location.hash='#campus'; if(window.cerrarModalEmergencia) window.cerrarModalEmergencia();", null);
                }
            });
        }
    }

    private void iniciarServicioForeground() {
        try {
            Intent svc = new Intent(this, MeshForegroundService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(this, svc);
            } else {
                startService(svc);
            }
        } catch (Exception e) {
            Log.w("UnexuamMain", "No se pudo iniciar MeshForegroundService: " + e.getMessage());
        }
    }

    private void detenerServicioForeground() {
        try {
            stopService(new Intent(this, MeshForegroundService.class));
        } catch (Exception e) {
            Log.w("UnexuamMain", "Error deteniendo servicio foreground: " + e.getMessage());
        }
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

    @SuppressLint("MissingPermission")
    public void mostrarAlarmaPantallaCompleta(String tipo, String titulo, String texto) {
        try {
            Intent fullIntent = new Intent(this, EmergencyAlertActivity.class);
            fullIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            fullIntent.putExtra(EmergencyAlertActivity.EXTRA_TIPO, tipo != null ? tipo : "general");
            fullIntent.putExtra(EmergencyAlertActivity.EXTRA_TITULO, titulo != null ? titulo : "Emergencia en el campus");
            fullIntent.putExtra(EmergencyAlertActivity.EXTRA_TEXTO, texto != null ? texto : "Evacúa hacia tu punto seguro.");

            PendingIntent fullPi = PendingIntent.getActivity(
                    this, 911, fullIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU
                    || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED) {
                NotificationCompat.Builder b = new NotificationCompat.Builder(this, CANAL_EMERGENCIAS)
                        .setSmallIcon(R.mipmap.ic_launcher)
                        .setContentTitle(titulo != null && !titulo.isEmpty() ? titulo : "EMERGENCIA UNEXUAM")
                        .setContentText(texto != null ? texto : "Toca para ver tu ruta de evacuación")
                        .setStyle(new NotificationCompat.BigTextStyle().bigText(texto != null ? texto : ""))
                        .setPriority(NotificationCompat.PRIORITY_MAX)
                        .setCategory(NotificationCompat.CATEGORY_ALARM)
                        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                        .setOngoing(true)
                        .setAutoCancel(true)
                        .setContentIntent(fullPi)
                        .setFullScreenIntent(fullPi, true);
                NotificationManagerCompat.from(this).notify(EmergencyAlertActivity.NOTIF_ALARMA_ID, b.build());
            }

            if (enPrimerPlano) {
                startActivity(fullIntent);
            }
        } catch (Exception e) {
            Log.w("UnexuamMain", "Error lanzando alarma pantalla completa: " + e.getMessage());
        }
    }

    @Override
    public void onDestroy() {
        if (btReceiverRegistrado) {
            try { unregisterReceiver(btReceiver); } catch (Exception ignored) {}
            btReceiverRegistrado = false;
        }
        MeshForegroundService.desadjuntarListener(meshUiListener);
        if (tts != null) {
            try {
                tts.stop();
                tts.shutdown();
            } catch (Exception ignored) {}
            tts = null;
            ttsListo = false;
        }
        super.onDestroy();
    }

    private void iniciarTts() {
        try {
            tts = new TextToSpeech(this, status -> {
                if (status != TextToSpeech.SUCCESS || tts == null) {
                    ttsListo = false;
                    return;
                }
                int r = tts.setLanguage(new Locale("es", "NI"));
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                    r = tts.setLanguage(new Locale("es"));
                }
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts.setLanguage(Locale.US);
                }
                tts.setSpeechRate(1.02f);
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String utteranceId) {}
                    @Override public void onDone(String utteranceId) { notificarFinVoz(); }
                    @Override public void onError(String utteranceId) { notificarFinVoz(); }
                });
                ttsListo = true;
            });
        } catch (Exception e) {
            ttsListo = false;
        }
    }

    private void notificarFinVoz() {
        runOnUiThread(() -> {
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().evaluateJavascript(
                        "window.__unexuamVozFin && window.__unexuamVozFin();", null);
            }
        });
    }

    private void enviarEventoAWeb(String eventoJson) {
        try {
            JSONObject ev = new JSONObject(eventoJson);
            String tipo = ev.optString("tipo", "");
            if ("paquete".equals(tipo)) {
                JSONObject pq = ev.optJSONObject("paquete");
                if (pq != null) {
                    String txt = pq.optString("texto", "");
                    String accion = pq.optString("accion", "");
                    String de = pq.optString("deNombre", pq.optString("de", "Unexuam"));
                    boolean esSos = txt.startsWith("SOS");
                    if ("finalizar".equals(accion)) {
                        // El motor web verifica que el cierre corresponde a la emergencia activa.
                    } else if ("emergencia".equals(accion) || "bloquear".equals(accion) || esSos) {
                        String emTipo = pq.optString("emergenciaTipo",
                                txt.toLowerCase(Locale.ROOT).contains("incendio") ? "incendio"
                                        : txt.toLowerCase(Locale.ROOT).contains("sismo") || txt.toLowerCase(Locale.ROOT).contains("temblor") ? "sismo"
                                        : txt.toLowerCase(Locale.ROOT).contains("inundaci") ? "inundacion" : "general");
                        String tit = pq.optString("titulo", esSos ? "ALERTA SOS · " + de : "Pasillo bloqueado en campus");
                        if (!enPrimerPlano) {
                            mostrarAlarmaPantallaCompleta(emTipo, tit, txt);
                        } else {
                            mostrarNotificacionNativa(tit, txt, "sos");
                        }
                    } else {
                        mostrarNotificacionNativa("Mensaje de " + de, txt, "mensaje");
                    }
                }
            } else if ("incidente".equals(tipo) || ev.optBoolean("recalcularRuta", false)) {
                if (!enPrimerPlano) {
                    mostrarAlarmaPantallaCompleta("general", "Pasillo bloqueado en campus", "Tu ruta de evacuación fue recalculada automáticamente.");
                } else {
                    mostrarNotificacionNativa("Pasillo bloqueado en campus", "Tu ruta de evacuación fue recalculada automáticamente.", "bloqueo");
                }
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
        boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.S_V2 ? !fine : (!fine && !coarse)) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN)
                    != PackageManager.PERMISSION_GRANTED) return false;
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                    != PackageManager.PERMISSION_GRANTED) return false;
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_ADVERTISE)
                    != PackageManager.PERMISSION_GRANTED) return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.NEARBY_WIFI_DEVICES)
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
        public boolean hablar(String texto, String idioma) {
            if (tts == null || !ttsListo || texto == null || texto.trim().isEmpty()) return false;
            try {
                if (idioma != null && idioma.toLowerCase(Locale.ROOT).startsWith("en")) {
                    tts.setLanguage(Locale.US);
                } else {
                    int r = tts.setLanguage(new Locale("es", "NI"));
                    if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                        tts.setLanguage(new Locale("es"));
                    }
                }
                int res = tts.speak(texto, TextToSpeech.QUEUE_FLUSH, null, "unexuam_ruta");
                return res == TextToSpeech.SUCCESS;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void detenerVoz() {
            if (tts != null) {
                try { tts.stop(); } catch (Exception ignored) {}
            }
        }

        @JavascriptInterface
        public void iniciarMesh(String perfilJson) {
            ultimoPerfilMesh = perfilJson;
            MeshForegroundService.guardarPerfilActivo(MainActivity.this, perfilJson);
            runOnUiThread(() -> {
                if (tienePermisosMesh()) {
                    iniciarServicioForeground();
                    meshNativa.iniciar(perfilJson);
                } else {
                    solicitarPermisosEntrada();
                }
            });
        }

        @JavascriptInterface
        public void reintentarMeshSiDesconectado() {
            runOnUiThread(() -> {
                if (meshNativa != null && tienePermisosMesh()) {
                    meshNativa.reintentarSiNecesario();
                }
            });
        }

        @JavascriptInterface
        public void setCustodiaDtn(boolean on) {
            if (meshNativa != null) meshNativa.setCustodiaHabilitada(on);
        }

        @JavascriptInterface
        public void guardarPrefsAlarma(boolean tono, boolean vibrar) {
            getSharedPreferences("unexuam_prefs_alarma", MODE_PRIVATE)
                    .edit()
                    .putBoolean("tono", tono)
                    .putBoolean("vibrar", vibrar)
                    .apply();
        }

        @JavascriptInterface
        public boolean puedePantallaCompleta() {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true;
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            return nm == null || nm.canUseFullScreenIntent();
        }

        @JavascriptInterface
        public void abrirAjustesPantallaCompleta() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                try {
                    Intent i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT);
                    i.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(i);
                } catch (Exception ignored) {}
            }
        }

        @JavascriptInterface
        public void actualizarPerfilMesh(String perfilJson) {
            ultimoPerfilMesh = perfilJson;
            MeshForegroundService.guardarPerfilActivo(MainActivity.this, perfilJson);
            runOnUiThread(() -> meshNativa.actualizarPerfil(perfilJson));
        }

        @JavascriptInterface
        public void detenerMesh() {
            ultimoPerfilMesh = null;
            MeshForegroundService.limpiarPerfilActivo(MainActivity.this);
            runOnUiThread(() -> {
                meshNativa.detener();
                detenerServicioForeground();
            });
        }

        @JavascriptInterface
        public int enviarPaqueteMesh(String paqueteJson) {
            return meshNativa != null ? meshNativa.enviarPaquete(paqueteJson) : 0;
        }

        @JavascriptInterface
        public void confirmarEntradaMesh(String id) {
            runOnUiThread(() -> {
                if (meshNativa != null) meshNativa.confirmarEntrada(id);
            });
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
        @SuppressLint("MissingPermission")
        public void vibrarPulso(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v == null || !v.hasVibrator()) return;
                long dur = Math.max(10L, Math.min(600L, (long) ms));
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createOneShot(dur, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(dur);
                }
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void notificar(String titulo, String cuerpo, String tipo) {
            runOnUiThread(() -> mostrarNotificacionNativa(titulo, cuerpo, tipo));
        }

        @JavascriptInterface
        public void lanzarAlarmaEmergencia(String tipo, String titulo, String texto) {
            runOnUiThread(() -> mostrarAlarmaPantallaCompleta(tipo, titulo, texto));
        }

        @JavascriptInterface
        public void detenerAlarmaEmergencia() {
            runOnUiThread(EmergencyAlertActivity::detenerSiActiva);
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
                long ahora = System.currentTimeMillis();
                for (String prov : lm.getProviders(true)) {
                    Location loc = lm.getLastKnownLocation(prov);
                    if (loc == null) continue;
                    if (ahora - loc.getTime() > 120_000L) continue;
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

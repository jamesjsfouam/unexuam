package ni.edu.uam.unexuam;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/**
 * Servicio en primer plano que mantiene activo el proceso de Unexuam
 * (Nearby Connections P2P + vigilancia gratuita de campus/estado sin Blaze) incluso
 * cuando el usuario bloquea la pantalla o minimiza la aplicación.
 */
public class MeshForegroundService extends Service {
    private static final String TAG = "UnexuamFgService";
    private static final String CANAL_SERVICIO = "unexuam_servicio";
    private static final String CANAL_EMERGENCIAS = "unexuam_emergencias";
    private static final int NOTIF_ID = 101;
    private static final String URL_CAMPUS_ESTADO =
            "https://firestore.googleapis.com/v1/projects/unexuam-campus-ni/databases/(default)/documents/campus/estado";
    private static final String PREFS_EM = "unexuam_fg_em";
    private static final String KEY_ULTIMO_ID = "ultimo_em_id";
    private ScheduledExecutorService vigiaCampus;

    @Override
    public void onCreate() {
        super.onCreate();
        crearCanal();
        iniciarVigilanciaCampus();
    }

    @Override
    public void onDestroy() {
        if (vigiaCampus != null) {
            vigiaCampus.shutdownNow();
            vigiaCampus = null;
        }
        super.onDestroy();
    }

    private void iniciarVigilanciaCampus() {
        if (vigiaCampus != null) return;
        vigiaCampus = Executors.newSingleThreadScheduledExecutor();
        vigiaCampus.scheduleWithFixedDelay(this::consultarCampusEstado, 15, 20, TimeUnit.SECONDS);
    }

    private void consultarCampusEstado() {
        HttpURLConnection con = null;
        try {
            con = (HttpURLConnection) new URL(URL_CAMPUS_ESTADO).openConnection();
            con.setConnectTimeout(4000);
            con.setReadTimeout(4000);
            con.setRequestMethod("GET");
            if (con.getResponseCode() != 200) return;

            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(con.getInputStream(), StandardCharsets.UTF_8))) {
                String linea;
                while ((linea = br.readLine()) != null) sb.append(linea);
            }
            JSONObject doc = new JSONObject(sb.toString());
            JSONObject fields = doc.optJSONObject("fields");
            JSONObject emNode = fields != null ? fields.optJSONObject("emergencia") : null;
            JSONObject emMap = emNode != null ? emNode.optJSONObject("mapValue") : null;
            JSONObject emFields = emMap != null ? emMap.optJSONObject("fields") : null;

            SharedPreferences prefs = getSharedPreferences(PREFS_EM, MODE_PRIVATE);
            if (emFields == null || emFields.length() == 0) {
                prefs.edit().remove(KEY_ULTIMO_ID).apply();
                return;
            }
            String id = valorTextoFS(emFields, "id");
            if (id.isEmpty()) {
                prefs.edit().remove(KEY_ULTIMO_ID).apply();
                return;
            }
            String previo = prefs.getString(KEY_ULTIMO_ID, "");
            if (id.equals(previo)) return;

            prefs.edit().putString(KEY_ULTIMO_ID, id).apply();
            String tipo = valorTextoFS(emFields, "tipo");
            if (tipo.isEmpty()) tipo = "general";
            String titulo = valorTextoFS(emFields, "titulo");
            if (titulo.isEmpty()) titulo = "EMERGENCIA UNEXUAM";
            String texto = valorTextoFS(emFields, "texto");
            if (texto.isEmpty()) texto = "Emergencia activa en el campus. Sigue tu ruta segura.";

            dispararAlarmaEnSegundoPlano(tipo, titulo, texto);
        } catch (Exception e) {
            Log.d(TAG, "Sin conexión para consultar campus/estado: " + e.getMessage());
        } finally {
            if (con != null) con.disconnect();
        }
    }

    private static String valorTextoFS(JSONObject fields, String key) {
        JSONObject item = fields != null ? fields.optJSONObject(key) : null;
        return item != null ? item.optString("stringValue", "").trim() : "";
    }

    private void dispararAlarmaEnSegundoPlano(String tipo, String titulo, String texto) {
        Intent fullIntent = new Intent(this, EmergencyAlertActivity.class);
        fullIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        fullIntent.putExtra(EmergencyAlertActivity.EXTRA_TIPO, tipo);
        fullIntent.putExtra(EmergencyAlertActivity.EXTRA_TITULO, titulo);
        fullIntent.putExtra(EmergencyAlertActivity.EXTRA_TEXTO, texto);

        PendingIntent fullPi = PendingIntent.getActivity(
                this, 914, fullIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            NotificationCompat.Builder b = new NotificationCompat.Builder(this, CANAL_EMERGENCIAS)
                    .setSmallIcon(R.mipmap.ic_launcher)
                    .setContentTitle(titulo)
                    .setContentText(texto)
                    .setStyle(new NotificationCompat.BigTextStyle().bigText(texto))
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setAutoCancel(true)
                    .setFullScreenIntent(fullPi, true)
                    .setContentIntent(fullPi);
            NotificationManagerCompat.from(this).notify(EmergencyAlertActivity.NOTIF_ALARMA_ID, b.build());
        }
        try {
            startActivity(fullIntent);
        } catch (Exception e) {
            Log.w(TAG, "Alarma diferida a notificación de pantalla completa: " + e.getMessage());
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            Notification notif = construirNotificacion();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
            } else {
                startForeground(NOTIF_ID, notif);
            }
        } catch (Exception e) {
            Log.w(TAG, "No se pudo iniciar ForegroundService: " + e.getMessage());
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void crearCanal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        NotificationChannel ch = new NotificationChannel(
                CANAL_SERVICIO,
                "Red Mesh Off-Grid activa",
                NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Mantiene la conexión de emergencia sin internet en segundo plano");
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);

        if (nm.getNotificationChannel(CANAL_EMERGENCIAS) == null) {
            NotificationChannel chEm = new NotificationChannel(
                    CANAL_EMERGENCIAS,
                    "Alertas de emergencia UAM",
                    NotificationManager.IMPORTANCE_HIGH);
            chEm.setDescription("Alarmas oficiales de evacuación en el campus");
            chEm.enableVibration(true);
            nm.createNotificationChannel(chEm);
        }
    }

    private Notification construirNotificacion() {
        Intent i = new Intent(this, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                this, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        return new NotificationCompat.Builder(this, CANAL_SERVICIO)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Unexuam · Red Mesh activa")
                .setContentText("Escuchando alertas SOS y mensajes sin internet")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setContentIntent(pi)
                .build();
    }
}

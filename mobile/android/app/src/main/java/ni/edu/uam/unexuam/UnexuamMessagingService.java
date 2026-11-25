package ni.edu.uam.unexuam;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/**
 * Servicio FCM para recibir alertas de emergencia en primer o segundo plano.
 */
public class UnexuamMessagingService extends FirebaseMessagingService {
    private static final String CANAL_EMERGENCIAS = "unexuam_emergencias";

    @Override
    public void onCreate() {
        super.onCreate();
        crearCanalEmergencias();
    }

    private void crearCanalEmergencias() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null && nm.getNotificationChannel(CANAL_EMERGENCIAS) == null) {
            NotificationChannel ch = new NotificationChannel(
                    CANAL_EMERGENCIAS,
                    "Alertas de emergencia UAM",
                    NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Notificaciones prioritarias de emergencia y evacuación");
            ch.enableVibration(true);
            nm.createNotificationChannel(ch);
        }
    }

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        Log.i("UnexuamFCM", "Token FCM actualizado.");
    }

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);
        Map<String, String> data = remoteMessage.getData();
        RemoteMessage.Notification notif = remoteMessage.getNotification();

        String tipo = data.getOrDefault("tipo", "general");
        String titulo = data.get("titulo");
        if (titulo == null || titulo.isEmpty()) {
            titulo = (notif != null && notif.getTitle() != null)
                    ? notif.getTitle()
                    : "EMERGENCIA UNEXUAM";
        }
        String texto = data.get("texto");
        if (texto == null || texto.isEmpty()) {
            texto = (notif != null && notif.getBody() != null)
                    ? notif.getBody()
                    : "Emergencia activa en el campus. Sigue tu ruta segura.";
        }

        if (data.containsKey("tipo") || data.containsKey("emergencia")) {
            mostrarAlarmaPush(tipo, titulo, texto);
        } else {
            mostrarNotificacionSimple(titulo, texto);
        }
    }

    private void mostrarAlarmaPush(String tipo, String titulo, String texto) {
        crearCanalEmergencias();
        Intent fullIntent = new Intent(this, EmergencyAlertActivity.class);
        fullIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        fullIntent.putExtra(EmergencyAlertActivity.EXTRA_TIPO, tipo);
        fullIntent.putExtra(EmergencyAlertActivity.EXTRA_TITULO, titulo);
        fullIntent.putExtra(EmergencyAlertActivity.EXTRA_TEXTO, texto);

        PendingIntent fullPi = PendingIntent.getActivity(
                this, 912, fullIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

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
            Log.w("UnexuamFCM", "Full-screen activity diferida a notificación: " + e.getMessage());
        }
    }

    private void mostrarNotificacionSimple(String titulo, String texto) {
        crearCanalEmergencias();
        if (ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pi = PendingIntent.getActivity(
                this, 913, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CANAL_EMERGENCIAS)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(titulo)
                .setContentText(texto)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pi);
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(913, b.build());
    }
}

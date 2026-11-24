package ni.edu.uam.unexuam;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;
import androidx.core.app.NotificationCompat;

/**
 * Servicio en primer plano que mantiene activo el proceso de Unexuam
 * (Nearby Connections P2P + notificaciones push Off-Grid) incluso cuando
 * el usuario bloquea la pantalla o minimiza la aplicación durante una evacuación.
 */
public class MeshForegroundService extends Service {
    private static final String TAG = "UnexuamFgService";
    private static final String CANAL_SERVICIO = "unexuam_servicio";
    private static final int NOTIF_ID = 101;

    @Override
    public void onCreate() {
        super.onCreate();
        crearCanal();
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

package ni.edu.uam.unexuam;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.animation.ValueAnimator;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PathMeasure;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.LinearInterpolator;

/**
 * Pantalla de carga nativa a 60-120 FPS desde el instante en que abre la app.
 * Fondo azul UNEXO (#0080ff), rayos del manual de marca y animacion continua de
 * X normal rompiendose hasta formar el logo oficial con ruptura central.
 */
public class SplashNativoView extends View {
    private static final int AZUL_UNEXO = 0xFF0080FF;
    private static final int AMARILLO_UNEXO = 0xFFFCD222;
    private static final long DURACION_MS = 2700L;

    private final Paint paintFondo = new Paint();
    private final Paint paintX = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint paintRayoGrieta = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint paintRayoFondo = new Paint(Paint.ANTI_ALIAS_FLAG);

    private final Path pathXIzq = new Path();
    private final Path pathXDer = new Path();
    private final Path pathGrieta = new Path();
    private final Path pathGrietaParcial = new Path();
    private final PathMeasure measureGrieta = new PathMeasure();

    private final Path[] rayosFondo = new Path[8];
    private final PathMeasure[] measuresRayos = new PathMeasure[8];
    private final Path pathRayoTemp = new Path();

    private float progreso = 0f;
    private ValueAnimator animator;
    private boolean cerrando = false;

    public SplashNativoView(Context context) {
        super(context);
        setClickable(true);
        setFocusable(true);
        setElevation(100f);

        paintFondo.setColor(AZUL_UNEXO);

        paintX.setColor(Color.WHITE);
        paintX.setStyle(Paint.Style.FILL);

        paintRayoGrieta.setColor(AMARILLO_UNEXO);
        paintRayoGrieta.setStyle(Paint.Style.STROKE);
        paintRayoGrieta.setStrokeCap(Paint.Cap.ROUND);
        paintRayoGrieta.setStrokeJoin(Paint.Join.ROUND);

        paintRayoFondo.setColor(Color.WHITE);
        paintRayoFondo.setStyle(Paint.Style.STROKE);
        paintRayoFondo.setStrokeCap(Paint.Cap.ROUND);
        paintRayoFondo.setStrokeJoin(Paint.Join.ROUND);

        for (int i = 0; i < rayosFondo.length; i++) {
            rayosFondo[i] = new Path();
            measuresRayos[i] = new PathMeasure();
        }

        setOnClickListener(v -> {
            if (progreso > 0.45f) desvanecerYSalir();
        });
    }

    public void iniciar() {
        if (animator != null) animator.cancel();
        animator = ValueAnimator.ofFloat(0f, 1f);
        animator.setDuration(DURACION_MS);
        animator.setInterpolator(new LinearInterpolator());
        animator.addUpdateListener(anim -> {
            progreso = (float) anim.getAnimatedValue();
            invalidate();
        });
        animator.addListener(new AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(Animator animation) {
                desvanecerYSalir();
            }
        });
        animator.start();
    }

    private void desvanecerYSalir() {
        if (cerrando) return;
        cerrando = true;
        if (animator != null) animator.cancel();
        animate()
                .alpha(0f)
                .scaleX(1.04f)
                .scaleY(1.04f)
                .setDuration(320L)
                .setListener(new AnimatorListenerAdapter() {
                    @Override
                    public void onAnimationEnd(Animator animation) {
                        if (getParent() instanceof ViewGroup) {
                            ((ViewGroup) getParent()).removeView(SplashNativoView.this);
                        }
                    }
                })
                .start();
    }

    @Override
    protected void onSizeChanged(int w, int h, int oldw, int oldh) {
        super.onSizeChanged(w, h, oldw, oldh);
        construirRayosFondo(w, h);
    }

    private void construirRayosFondo(int w, int h) {
        float wf = w;
        float hf = h;
        float[][] coords = {
                {0.14f, -0.02f, 0.23f, 0.14f, 0.17f, 0.18f, 0.28f, 0.34f},
                {0.86f, -0.02f, 0.76f, 0.16f, 0.82f, 0.20f, 0.70f, 0.36f},
                {-0.02f, 0.30f, 0.21f, 0.36f, 0.16f, 0.40f, 0.36f, 0.46f},
                {1.02f, 0.29f, 0.79f, 0.36f, 0.84f, 0.39f, 0.64f, 0.46f},
                {0.38f, 0.50f, 0.29f, 0.58f, 0.34f, 0.60f, 0.18f, 0.72f},
                {0.62f, 0.50f, 0.71f, 0.58f, 0.66f, 0.60f, 0.84f, 0.73f},
                {0.10f, 0.72f, 0.27f, 0.81f, 0.22f, 0.84f, 0.36f, 0.99f},
                {0.90f, 0.72f, 0.73f, 0.81f, 0.78f, 0.84f, 0.64f, 0.99f}
        };
        for (int i = 0; i < rayosFondo.length; i++) {
            Path p = rayosFondo[i];
            p.reset();
            p.moveTo(coords[i][0] * wf, coords[i][1] * hf);
            p.lineTo(coords[i][2] * wf, coords[i][3] * hf);
            p.lineTo(coords[i][4] * wf, coords[i][5] * hf);
            p.lineTo(coords[i][6] * wf, coords[i][7] * hf);
            measuresRayos[i].setPath(p, false);
        }
    }

    private float clamp01(float x) {
        return Math.max(0f, Math.min(1f, x));
    }

    private float easeOutCubic(float t) {
        float u = 1f - clamp01(t);
        return 1f - u * u * u;
    }

    private float easeOutBack(float t) {
        float u = clamp01(t) - 1f;
        float s = 1.6f;
        return 1f + u * u * ((s + 1f) * u + s);
    }

    @Override
    protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        int w = getWidth();
        int h = getHeight();
        if (w <= 0 || h <= 0) return;

        // 1. Fondo full azul UNEXO sin bordes
        canvas.drawRect(0, 0, w, h, paintFondo);

        float t = progreso;

        // 2. Rayos del manual de marca animandose en el fondo al momento del quiebre
        float dp = getResources().getDisplayMetrics().density;
        paintRayoFondo.setStrokeWidth(2.1f * dp);
        for (int i = 0; i < rayosFondo.length; i++) {
            float inicio = 0.26f + i * 0.03f;
            float progRayo = easeOutCubic((t - inicio) / 0.34f);
            if (progRayo > 0f) {
                float len = measuresRayos[i].getLength();
                pathRayoTemp.reset();
                measuresRayos[i].getSegment(0f, len * progRayo, pathRayoTemp, true);
                float fade = t < 0.78f ? 1f : 1f - 0.52f * clamp01((t - 0.78f) / 0.22f);
                paintRayoFondo.setAlpha((int) (78f * Math.min(1f, progRayo * 1.4f) * fade));
                canvas.drawPath(pathRayoTemp, paintRayoFondo);
            }
        }

        // 3. Geometria de la X centrada sola (de X normal -> X rota oficial UNEXO)
        float tamX = Math.min(w, h) * 0.34f;
        float cx = w * 0.5f;
        float cy = h * 0.5f;

        // Entrada suave 0.00 -> 0.22
        float entrada = easeOutCubic(t / 0.22f);
        float escala = 0.86f + 0.14f * entrada;

        // Temblor sismico antes/durante la ruptura (0.28 -> 0.42)
        float shakeX = 0f;
        float shakeY = 0f;
        if (t >= 0.28f && t <= 0.43f) {
            float k = (t - 0.28f) / 0.15f;
            float amp = tamX * 0.025f * (1f - Math.abs(k * 2f - 1f));
            shakeX = (float) Math.sin(k * Math.PI * 6.0) * amp;
            shakeY = (float) Math.cos(k * Math.PI * 5.0) * amp * 0.7f;
        }

        // Factor de apertura de la grieta central: 0 (X normal) -> 1 (logo roto UNEXO)
        float ruptura = t < 0.34f ? 0f : easeOutBack((t - 0.34f) / 0.28f);
        float gap = tamX * 0.115f * ruptura; // ancho de la grieta central en el logo
        float retroceso = (t >= 0.36f && t <= 0.62f)
                ? (float) Math.sin(((t - 0.36f) / 0.26f) * Math.PI) * tamX * 0.028f
                : 0f;

        canvas.save();
        canvas.translate(cx + shakeX, cy + shakeY);
        canvas.scale(escala, escala);

        float half = tamX * 0.5f;
        float brazo = tamX * 0.27f; // ancho del brazo en los extremos

        // Vertices en coordenadas relativas [-half, +half]
        // Mitad izquierda (con borde derecho en zig-zag que se abre hacia la izquierda al romperse)
        pathXIzq.reset();
        pathXIzq.moveTo(-half, -half);
        pathXIzq.lineTo(-half + brazo, -half);
        // Al llegar al nucleo central, la grieta zig-zag baja desde y = -half*0.38 hasta y = +half*0.30
        float g1x = -gap * 0.45f;
        float g2x = -gap * 0.92f;
        float g3x = -gap * 0.36f;
        float g4x = -gap * 0.62f;
        float yTop = -half * 0.36f;
        float yG1 = -half * 0.28f;
        float yG2 = -half * 0.04f;
        float yG3 = half * 0.14f;
        float yBot = half * 0.34f;

        pathXIzq.lineTo(g1x, yTop);
        pathXIzq.lineTo(g2x, yG1);
        pathXIzq.lineTo(g3x, yG2);
        pathXIzq.lineTo(g4x, yG3);
        pathXIzq.lineTo(0f, yBot);
        pathXIzq.lineTo(-half + brazo, half);
        pathXIzq.lineTo(-half, half);
        pathXIzq.lineTo(-half * 0.34f, 0f);
        pathXIzq.close();

        // Mitad derecha (con el zig-zag complementario abriendo hacia la derecha)
        pathXDer.reset();
        pathXDer.moveTo(half - brazo, -half);
        pathXDer.lineTo(half, -half);
        pathXDer.lineTo(half * 0.34f, 0f);
        pathXDer.lineTo(half, half);
        pathXDer.lineTo(half - brazo, half);
        pathXDer.lineTo(0f, yBot);
        pathXDer.lineTo(gap * 0.28f, yG3);
        pathXDer.lineTo(gap * 0.82f, yG2);
        pathXDer.lineTo(gap * 0.32f, yG1);
        pathXDer.lineTo(gap * 0.68f, yTop);
        pathXDer.close();

        paintX.setAlpha((int) (255f * entrada));

        // Cuando ruptura == 0 (X normal), unimos sin costura dibujando una linea central solapada
        canvas.save();
        canvas.translate(-retroceso, -retroceso * 0.35f);
        canvas.drawPath(pathXIzq, paintX);
        canvas.restore();

        canvas.save();
        canvas.translate(retroceso, retroceso * 0.35f);
        canvas.drawPath(pathXDer, paintX);
        canvas.restore();

        if (ruptura < 0.06f) {
            // Sello subpixel para que la X sea 100% continua antes de la ruptura
            canvas.drawRect(-tamX * 0.04f, yTop, tamX * 0.04f, yBot, paintX);
        }

        // 4. Rayo amarillo/blanco trazando la grieta en el instante exacto de romperse (0.31 -> 0.56)
        if (t >= 0.31f && t <= 0.58f) {
            pathGrieta.reset();
            pathGrieta.moveTo(tamX * 0.05f, yTop - half * 0.14f);
            pathGrieta.lineTo(-tamX * 0.03f, yG1);
            pathGrieta.lineTo(tamX * 0.035f, yG2);
            pathGrieta.lineTo(-tamX * 0.025f, yG3);
            pathGrieta.lineTo(0f, yBot + half * 0.04f);
            measureGrieta.setPath(pathGrieta, false);

            float pRayo = easeOutCubic((t - 0.31f) / 0.14f);
            float alphaRayo = t < 0.44f ? 1f : 1f - clamp01((t - 0.44f) / 0.14f);
            pathGrietaParcial.reset();
            measureGrieta.getSegment(0f, measureGrieta.getLength() * pRayo, pathGrietaParcial, true);
            paintRayoGrieta.setStrokeWidth(3.6f * dp);
            paintRayoGrieta.setAlpha((int) (255f * alphaRayo));
            canvas.drawPath(pathGrietaParcial, paintRayoGrieta);
        }

        canvas.restore();
    }
}

# Pruebas de Alex Training Lab

Cómo ejecutarlas (desde la carpeta raíz del proyecto):

    pip install playwright
    python -m playwright install chromium
    python tests/run_tests.py

Qué comprueban:
- Sintaxis del JavaScript de las dos apps y de los service workers.
- Que los manifiestos son válidos y que sus iconos existen.
- Que todas las imágenes referenciadas en el HTML están en su carpeta (las que falten salen como FALLO).
- Comportamientos clave: alta (validaciones), historial del entrenado, botones de WhatsApp, consentimiento del ciclo y resumen semanal.

Si una prueba falla, el mensaje dice qué revisar. Las pruebas de resistencia dependen de la red: sin conexión a Supabase solo se comprueba que no hay errores propios.

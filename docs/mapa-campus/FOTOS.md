# Cómo se ve cada edificio (revisión de fotos)

Revisión del 22/11/2026: más de 60 fotos públicas de la UAM en 10 búsquedas de imágenes de Google (campus, Edificios A/B/C, UAM College, Edificio Copérnico, la Biblioteca, las Clínicas Odontológicas, el Jaguar Center, el Jaguar Stadium, el Food Court y el Auditorio), más una foto aérea del campus (nota «Top of Mind 2024»). No se guardaron las fotos: aquí solo quedan las observaciones que se usan en el mapa 3D.

## En general
- **Muros:** blancos, con techos planos blancos o gris claro.
- **Ventanas:** de vidrio azulado, en franjas horizontales (una por piso). En el mapa, cada piso tiene su franja.
- **Techos naranjas:** la foto aérea muestra algunos de teja naranja cerca de las canchas. Encajan con los comedores techados.

## Por edificio
| Edificio | Lo que muestran las fotos | Cómo está en el mapa |
|---|---|---|
| Edificio A | Fachada principal «UNIVERSIDAD AMERICANA» con el sello al centro, ventanas azules en hileras, entrada de vidrio con banners y el rótulo «EDIFICIO A» arriba | Muro blanco con franjas de ventanas |
| Edificio B | **Sin foto verificada del exterior.** La foto del edificio blanco con balcones y un muro de ladrillo con el logo UAM (nota «Top of Mind 2024» de la UAM) muestra **3 niveles** (planta baja abierta y 2 de balcones), así que no puede ser el B, que tiene 2 pisos. Su rótulo no se lee | Estilo general: blanco con ventanas por piso, sin ladrillo |
| Edificio M (UAM College) | Blanco, de 3 pisos, con un muro cortina de vidrio turquesa en la escalera y un roble de flores rosadas delante | Franja de vidrio turquesa |
| Edificio P «Copérnico» | Fuentes: artículo de la UAM «UAM celebra certificaciones ambientales con la inauguración del Edificio Copérnico» (uam.edu.ni) y la foto aérea del premio OLACDE. **Tres pisos**, techo que refleja el calor, celdas solares, captación de lluvia y **tres observatorios** (astronómico, meteorológico y sismógrafo). La torre está en el **extremo este**: es blanca, con una franja verde arriba, el sello dorado y las letras UAM, el rótulo «EDIFICIO P · COPÉRNICO», ventanas cuadradas oscuras y la cúpula blanca. Los pasillos abiertos con barandas grises dan al **norte** (hacia el parqueo con celdas solares), y hay una terraza con baranda en el techo. Las gradas tienen bordes amarillos (no se pudo confirmar en qué extremo) | Fachada sur con ventanas por piso, techo solar con baranda de terraza y torre este con franja verde, sello, ventanas y cúpula |
| Clínicas Odontológicas | Blanco, de 2 pisos, ventanales grandes, unidades de aire acondicionado y una franja azul con letras doradas que dice «EDIFICIO N» | Franja azul con detalle dorado. Dato `"detalle"` en `lugares.json` |
| Biblioteca Pablo Antonio Cuadra (Edificio I) | Muro gris claro con un mural del poeta y ventanas en franja | Muro claro con ventanas |
| Jaguar Center | Gimnasio cerrado: bóveda gris de medio barril y fachadas grises con paneles turquesa; por dentro, una cancha techada | Bóveda de medio barril y paneles turquesa |
| Jaguar Stadium (béisbol) | Graderías azules, una pizarra azul «JAGUAR STADIUM», malla verde y tierra roja en el cuadro | Graderías azules junto a las líneas de foul y la pizarra en el jardín central |
| Auditorio Central | Se llama «Rubén Darío». Salón amplio con cerchas verdes | Dato `"detalle"` |
| Food Court | Locales de comida con rótulos de colores | Sin cambios |
| Banco Banpro (verificada: foto de la ficha «Banpro Sucursal UAM» en Google Maps) | Agencia de un piso, fachada gris oscuro con vidrio y el logo blanco de Banpro | 1 piso |
| Biblioteca (ampliación) | Edificio de un solo piso con ventanales largos | 1 piso (dato de James) |
| Plazoleta (foto principal de la ficha de la UAM) | Cancha de básquet techada, con estructura turquesa y malla azul | Sin cambios |

## Pisos confirmados por James (22/11/2026)
- **Edificio A:** 2 pisos, aunque en la fachada principal se vean 3 hileras de ventanas.
- **Edificio C:** 3 pisos.

## Sin fotos del exterior
No se encontraron fotos verificables del exterior (en Google Imágenes ni en las fichas de Google Maps) de: Edificios D, E, F, J y O, los salones de Contenedores, Multiusos, Danza y Música, Vestidores, Laboratorios, El Ranchero, El Chilamate, el Comedor y el Kiosko del Jaguarcito, ni los Kioskos de comida. Las fichas de Google Maps de los Edificios F, J y O no tienen fotos, y la del Auditorio solo tiene una del interior. Esos edificios usan el estilo general: blanco con ventanas por piso.
- **Kiosko del Jaguarcito:** es muy pequeño (James). En el mapa ocupa 6 × 5 m, en vez del contorno de 732 m² de OSM.

## Edificios B y C
No se encontró ninguna foto del exterior que identifique al **Edificio B** ni al **Edificio C** (Google Imágenes, uam.edu.ni y fichas de Google Maps, 23/11/2026). Por eso usan el estilo general del campus: blanco, techo plano y una franja de ventanas azuladas por piso. Si James tiene fotos propias de las fachadas, se pueden agregar.

## Edificio P: fachada norte (foto de James, 23/11/2026)
Foto tomada desde el parqueo con cubiertas de celdas solares, al **norte** del P, mirando al sur. A la izquierda (este) asoma la torre del observatorio.
- **Pisos:** 3, con techo-terraza y baranda gris continua.
- **Pisos 2 y 3:** **pasillos abiertos** (balcón corrido) a lo largo de toda la fachada, con barandas grises horizontales. Ese pasillo es el que en el grafo se modela con los pabellones.
- **Planta baja:** las aulas **dan directo afuera**, al césped y al parqueo. No tienen pasillo interior.
- **Bahías:** columnas grises separan la fachada en bahías; cada bahía es **un aula**, con **dos puertas grises** (adelante y atrás) y ventanas de marco blanco y vidrio oscuro.
- **Colores aproximados:**

| Elemento | Color |
|---|---|
| Muro | blanco `#f2f4f6` |
| Losas y vigas | gris claro `#dfe3e8` |
| Puertas y columnas | gris `#6f7c8a` |
| Barandas | gris `#8a96a3` |
| Marco de ventana | blanco |
| Vidrio | oscuro `#3a4552` |

- **En el mapa 3D:** esta fachada no se ve, porque el mapa mira desde el sur. Se nota en la baranda de la terraza y en la torre este.

# Menu de consola (estilo del profe). Aqui SI se imprime; en las clases no.
# Ejecutar desde la carpeta del proyecto:  python -m backend.menu

import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.datos import crearCampus, crearRedMesh
from backend.evacuacion import rutaEvacuacion, aplicarAlerta
from backend.mesh import propagarAlerta


def limpiar():
    os.system("cls" if os.name == "nt" else "clear")


def pausa():
    input("Presione ENTER para continuar...")


def mostrarGrafo(grafo):
    for v in grafo.vertexs:
        texto = v.nombre + " ->"
        for vecino in v.neig:
            texto = texto + " " + vecino[0].nombre + "(" + str(vecino[1]) + ")"
        print(texto)


def elegirGrafo(campus, red):
    print("1. Campus   2. Red Mesh")
    if input("Grafo: ") == "2":
        return red
    return campus


def menu():
    campus, zonasSeguras = crearCampus()
    red = crearRedMesh()
    opcion = ""
    while opcion != "0":
        limpiar()
        print("===== EVACUACION OFF-GRID UAM =====")
        print("1. Mostrar grafo")
        print("2. Insertar vertice")
        print("3. Insertar arista")
        print("4. Eliminar arista")
        print("5. Eliminar vertice")
        print("6. Actualizar peso")
        print("7. Propagar alerta (red Mesh, BFS con TTL)")
        print("8. Aplicar alerta en un lugar (campus)")
        print("9. Ruta de evacuacion (Dijkstra)")
        print("0. Salir")
        opcion = input("Opcion: ")
        limpiar()

        if opcion == "1":
            mostrarGrafo(elegirGrafo(campus, red))
        elif opcion == "2":
            g = elegirGrafo(campus, red)
            if g.insertarVertice(input("Nombre: ")):
                print("Vertice insertado.")
            else:
                print("Ya existe.")
        elif opcion == "3":
            g = elegirGrafo(campus, red)
            o = input("Origen: ")
            d = input("Destino: ")
            p = float(input("Peso: "))
            if g.insertarArista(o, d, p):
                print("Arista insertada.")
            else:
                print("Origen o destino no existe.")
        elif opcion == "4":
            g = elegirGrafo(campus, red)
            if g.eliminarArista(input("Origen: "), input("Destino: ")):
                print("Arista eliminada.")
            else:
                print("No existe esa arista.")
        elif opcion == "5":
            g = elegirGrafo(campus, red)
            if g.eliminarVertice(input("Nombre: ")):
                print("Vertice eliminado.")
            else:
                print("No existe.")
        elif opcion == "6":
            g = elegirGrafo(campus, red)
            o = input("Origen: ")
            d = input("Destino: ")
            p = float(input("Nuevo peso: "))
            if g.actualizarPeso(o, d, p):
                print("Peso actualizado.")
            else:
                print("No existe esa arista.")
        elif opcion == "7":
            origen = input("Telefono que emite: ")
            ttl = int(input("TTL (saltos maximos): "))
            alcanzados = propagarAlerta(red, origen, ttl)
            if len(alcanzados) == 0:
                print("Ese telefono no existe.")
            for tel in alcanzados:
                print("Salto", tel[1], ":", tel[0])
        elif opcion == "8":
            lugar = input("Lugar en peligro: ")
            factor = float(input("Factor (ej. 3): "))
            if aplicarAlerta(campus, lugar, factor):
                print("Pesos multiplicados por", factor)
            else:
                print("Ese lugar no existe.")
        elif opcion == "9":
            ruta, tiempo = rutaEvacuacion(campus, input("Donde estas: "), zonasSeguras)
            if len(ruta) == 0:
                print("No hay ruta a ninguna zona segura.")
            else:
                print(" -> ".join(ruta))
                print("Tiempo:", tiempo, "segundos")
        if opcion != "0":
            pausa()


if __name__ == "__main__":
    menu()

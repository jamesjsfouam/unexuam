
import os

# Estructuras de Datos: GRAFO DIRIGIDO Y PONDERADO

class Vertex:
    def __init__(self,city:str):
        self.city=city
        self.neig=[]

class Graph:
    def __init__(self):
        self.vertexs=[]

    def insertarVertice(self,city:str):
        for vertice in self.vertexs:
            if vertice.city.lower()==city.lower():
                return False

        nuevo=Vertex(city)
        self.vertexs.append(nuevo)
        return True

    def mostrarVertices(self):
        if len(self.vertexs)==0:
            print("No hay ciudades registradas.")
        else:
            print("=== CIUDADES REGISTRADAS ===")
            for i,vertice in enumerate(self.vertexs,1):
                print(f"{i}. {vertice.city}")


def main():
    grafo=Graph()

    while True:
        os.system("cls" if os.name=="nt" else "clear")

        print("=== GRAFO DIRIGIDO Y PONDERADO ===")
        print("1. Insertar vértice")
        print("2. Mostrar vértices")
        print("3. Salir")

        opcion=input("\nSeleccione una opción: ")

        if opcion=="1":
            os.system("cls" if os.name=="nt" else "clear")
            print("=== INSERCIÓN DE VÉRTICES ===")

            ciudad=input("Ingrese el nombre de la ciudad: ").strip()

            if ciudad=="":
                print("ERROR. El nombre no puede estar vacío.")
            elif grafo.insertarVertice(ciudad):
                print(f"Ciudad '{ciudad}' insertada correctamente.")
            else:
                print(f"ERROR. La ciudad '{ciudad}' ya existe.")

        elif opcion=="2":
            os.system("cls" if os.name=="nt" else "clear")
            grafo.mostrarVertices()

        elif opcion=="3":
            print("Programa finalizado.")
            break

        else:
            print("ERROR. Seleccione una opción válida.")

        input("\nPresione ENTER para continuar...")


if __name__=="__main__":
    main()

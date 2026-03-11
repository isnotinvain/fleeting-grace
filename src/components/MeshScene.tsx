import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { Mesh as AppMesh } from "../mesh/tube";

const MATERIAL_COLORS: Record<string, string> = {
  tlon: "#ff6b6b",
  uqbar: "#4ecdc4",
  orbis_tertius: "#ffe66d",
};

interface NamedMesh {
  name: string;
  material: string;
  mesh: AppMesh;
}

interface MeshSceneProps {
  meshes: NamedMesh[];
}

function MeshObject({ mesh, material }: { mesh: AppMesh; material: string }) {
  const geometry = useMemo(() => {
    const geom = new THREE.BufferGeometry();

    const positions = new Float32Array(mesh.vertices.length * 3);
    for (let i = 0; i < mesh.vertices.length; i++) {
      positions[i * 3] = mesh.vertices[i][0];
      positions[i * 3 + 1] = mesh.vertices[i][1];
      positions[i * 3 + 2] = mesh.vertices[i][2];
    }
    geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const indices = new Uint32Array(mesh.faces.length * 3);
    for (let i = 0; i < mesh.faces.length; i++) {
      indices[i * 3] = mesh.faces[i][0];
      indices[i * 3 + 1] = mesh.faces[i][1];
      indices[i * 3 + 2] = mesh.faces[i][2];
    }
    geom.setIndex(new THREE.BufferAttribute(indices, 1));
    geom.computeVertexNormals();

    return geom;
  }, [mesh]);

  const color = MATERIAL_COLORS[material] ?? "#ffffff";

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} side={THREE.DoubleSide} flatShading />
    </mesh>
  );
}

export function MeshScene({ meshes }: MeshSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 15], fov: 50 }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 10, 10]} intensity={0.8} />
      <directionalLight position={[-10, -5, -10]} intensity={0.3} />
      <OrbitControls />

      {meshes.map((m, i) => (
        m.mesh.vertices.length > 0 && (
          <MeshObject key={i} mesh={m.mesh} material={m.material} />
        )
      ))}
    </Canvas>
  );
}

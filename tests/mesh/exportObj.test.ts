import { describe, it, expect } from "vitest";
import { generateObj, generateMtl } from "../../src/mesh/exportObj";
import { generateSphere } from "../../src/mesh/sphere";

describe("generateObj", () => {
  it("produces valid OBJ with header and mtllib reference", () => {
    const sphere = generateSphere([0, 0, 0], 1, 4);
    const obj = generateObj(
      [{ name: "test_sphere", material: "tlon", mesh: sphere }],
      "output.mtl",
    );
    expect(obj).toContain("mtllib output.mtl");
    expect(obj).toContain("o test_sphere");
    expect(obj).toContain("usemtl tlon");
  });

  it("OBJ face indices are 1-based", () => {
    const mesh = {
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] as [number, number, number][],
      faces: [[0, 1, 2]] as [number, number, number][],
    };
    const obj = generateObj(
      [{ name: "tri", material: "tlon", mesh }],
      "test.mtl",
    );
    expect(obj).toContain("f 1 2 3");
  });

  it("handles multiple meshes with correct vertex offsets", () => {
    const tri1 = {
      vertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] as [number, number, number][],
      faces: [[0, 1, 2]] as [number, number, number][],
    };
    const tri2 = {
      vertices: [[2, 0, 0], [3, 0, 0], [2, 1, 0]] as [number, number, number][],
      faces: [[0, 1, 2]] as [number, number, number][],
    };
    const obj = generateObj(
      [
        { name: "a", material: "tlon", mesh: tri1 },
        { name: "b", material: "uqbar", mesh: tri2 },
      ],
      "test.mtl",
    );
    // First mesh: f 1 2 3
    // Second mesh: offset by 3, so f 4 5 6
    expect(obj).toContain("f 1 2 3");
    expect(obj).toContain("f 4 5 6");
  });

  it("skips empty meshes", () => {
    const empty = { vertices: [] as [number, number, number][], faces: [] as [number, number, number][] };
    const obj = generateObj(
      [{ name: "empty", material: "tlon", mesh: empty }],
      "test.mtl",
    );
    expect(obj).not.toContain("o empty");
  });

  it("vertex lines have 6 decimal places", () => {
    const mesh = {
      vertices: [[1.23456789, 0, 0]] as [number, number, number][],
      faces: [] as [number, number, number][],
    };
    const obj = generateObj(
      [{ name: "t", material: "tlon", mesh }],
      "test.mtl",
    );
    expect(obj).toContain("v 1.234568 0.000000 0.000000");
  });
});

describe("generateMtl", () => {
  it("contains all 3 body materials", () => {
    const mtl = generateMtl();
    expect(mtl).toContain("newmtl tlon");
    expect(mtl).toContain("newmtl uqbar");
    expect(mtl).toContain("newmtl orbis_tertius");
  });

  it("contains diffuse colors", () => {
    const mtl = generateMtl();
    expect(mtl).toContain("Kd 1.0000 0.4200 0.4200"); // tlon red
    expect(mtl).toContain("Kd 0.3100 0.8000 0.7700"); // uqbar cyan
  });
});

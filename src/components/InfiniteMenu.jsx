import { useEffect, useRef, useState } from "react";
import { mat4, quat, vec2, vec3 } from "gl-matrix";
import CountUp from "./CountUp";
import Particles from "./Particles";
import "./InfiniteMenu.css";

const backgroundParticleColors = ["#b8ff57", "#f4f1e8", "#6f746a"];

const discVertShaderSource = `#version 300 es
uniform mat4 uWorldMatrix;
uniform mat4 uViewMatrix;
uniform mat4 uProjectionMatrix;
uniform vec4 uRotationAxisVelocity;

in vec3 aModelPosition;
in vec2 aModelUvs;
in mat4 aInstanceMatrix;

out vec2 vUvs;
out float vAlpha;
flat out int vInstanceId;

void main() {
  vec4 worldPosition = uWorldMatrix * aInstanceMatrix * vec4(aModelPosition, 1.0);
  vec3 centerPos = (uWorldMatrix * aInstanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float radius = length(centerPos);

  if (gl_VertexID > 0) {
    vec3 rotationAxis = uRotationAxisVelocity.xyz;
    float rotationVelocity = min(0.15, uRotationAxisVelocity.w * 15.0);
    vec3 stretchDir = normalize(cross(centerPos, rotationAxis));
    vec3 relativeVertexPos = normalize(worldPosition.xyz - centerPos);
    float strength = dot(stretchDir, relativeVertexPos);
    float invAbsStrength = min(0.0, abs(strength) - 1.0);
    strength = rotationVelocity * sign(strength) *
      abs(invAbsStrength * invAbsStrength * invAbsStrength + 1.0);
    worldPosition.xyz += stretchDir * strength;
  }

  worldPosition.xyz = radius * normalize(worldPosition.xyz);
  gl_Position = uProjectionMatrix * uViewMatrix * worldPosition;
  vAlpha = smoothstep(0.5, 1.0, normalize(worldPosition.xyz).z) * 0.88 + 0.12;
  vUvs = aModelUvs;
  vInstanceId = gl_InstanceID;
}
`;

const discFragShaderSource = `#version 300 es
precision highp float;

uniform sampler2D uTex;
uniform int uAtlasSize;

out vec4 outColor;
in vec2 vUvs;
in float vAlpha;
flat in int vInstanceId;

void main() {
  int cellX = vInstanceId % uAtlasSize;
  int cellY = vInstanceId / uAtlasSize;
  vec2 cellSize = vec2(1.0) / vec2(float(uAtlasSize));
  vec2 cellOffset = vec2(float(cellX), float(cellY)) * cellSize;
  vec2 st = vec2(vUvs.x, 1.0 - vUvs.y) * cellSize + cellOffset;

  outColor = texture(uTex, st);
  outColor.a *= vAlpha;
}
`;

class Face {
  constructor(a, b, c) {
    this.a = a;
    this.b = b;
    this.c = c;
  }
}

class Vertex {
  constructor(x, y, z) {
    this.position = vec3.fromValues(x, y, z);
    this.uv = vec2.create();
  }
}

class Geometry {
  vertices = [];
  faces = [];

  addVertex(...args) {
    for (let index = 0; index < args.length; index += 3) {
      this.vertices.push(
        new Vertex(args[index], args[index + 1], args[index + 2]),
      );
    }
    return this;
  }

  addFace(...args) {
    for (let index = 0; index < args.length; index += 3) {
      this.faces.push(new Face(args[index], args[index + 1], args[index + 2]));
    }
    return this;
  }

  get lastVertex() {
    return this.vertices[this.vertices.length - 1];
  }
}

class DiscGeometry extends Geometry {
  constructor(steps = 48, radius = 1) {
    super();
    const alpha = (2 * Math.PI) / Math.max(4, steps);
    this.addVertex(0, 0, 0);
    vec2.set(this.lastVertex.uv, 0.5, 0.5);

    for (let index = 0; index < steps; index += 1) {
      const x = Math.cos(alpha * index);
      const y = Math.sin(alpha * index);
      this.addVertex(radius * x, radius * y, 0);
      vec2.set(this.lastVertex.uv, x * 0.5 + 0.5, y * 0.5 + 0.5);
      if (index > 0) this.addFace(0, index, index + 1);
    }
    this.addFace(0, steps, 1);
  }
}

function createProgram(gl, vertexSource, fragmentSource) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(
        gl.getShaderInfoLog(shader) || "Shader compilation failed",
      );
    }
    return shader;
  };

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
  gl.bindAttribLocation(program, 0, "aModelPosition");
  gl.bindAttribLocation(program, 1, "aModelUvs");
  gl.bindAttribLocation(program, 2, "aInstanceMatrix");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(program) || "Shader linking failed");
  }
  return program;
}

function makeBuffer(gl, data, usage) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  return buffer;
}

class ArcballControl {
  isPointerDown = false;
  orientation = quat.create();
  pointerRotation = quat.create();
  rotationVelocity = 0;
  rotationAxis = vec3.fromValues(1, 0, 0);
  snapDirection = vec3.fromValues(0, 0, -1);
  snapTargetDirection = null;
  pointerPosition = vec2.create();
  previousPointerPosition = vec2.create();
  smoothedRotation = quat.create();
  abortController = new AbortController();

  constructor(canvas, updateCallback) {
    this.canvas = canvas;
    this.updateCallback = updateCallback;
    const options = { signal: this.abortController.signal };

    canvas.addEventListener(
      "pointerdown",
      (event) => {
        vec2.set(this.pointerPosition, event.clientX, event.clientY);
        vec2.copy(this.previousPointerPosition, this.pointerPosition);
        this.isPointerDown = true;
        canvas.setPointerCapture(event.pointerId);
      },
      options,
    );
    canvas.addEventListener(
      "pointerup",
      () => {
        this.isPointerDown = false;
      },
      options,
    );
    canvas.addEventListener(
      "pointermove",
      (event) => {
        if (this.isPointerDown) {
          vec2.set(this.pointerPosition, event.clientX, event.clientY);
        }
      },
      options,
    );
  }

  update(deltaTime, targetFrameDuration) {
    const timeScale = deltaTime / targetFrameDuration + 0.00001;
    let angleFactor = timeScale;
    const snapRotation = quat.create();

    if (this.isPointerDown) {
      const movement = vec2.sub(
        vec2.create(),
        this.pointerPosition,
        this.previousPointerPosition,
      );
      vec2.scale(movement, movement, 0.3 * timeScale);
      if (vec2.sqrLen(movement) > 0.1) {
        vec2.add(movement, this.previousPointerPosition, movement);
        const a = vec3.normalize(vec3.create(), this.project(movement));
        const b = vec3.normalize(
          vec3.create(),
          this.project(this.previousPointerPosition),
        );
        vec2.copy(this.previousPointerPosition, movement);
        angleFactor *= 5 / timeScale;
        this.quatFromVectors(a, b, this.pointerRotation, angleFactor);
      } else {
        quat.slerp(
          this.pointerRotation,
          this.pointerRotation,
          quat.create(),
          0.3 * timeScale,
        );
      }
    } else {
      quat.slerp(
        this.pointerRotation,
        this.pointerRotation,
        quat.create(),
        0.1 * timeScale,
      );
      if (this.snapTargetDirection) {
        const distance = vec3.squaredDistance(
          this.snapTargetDirection,
          this.snapDirection,
        );
        angleFactor *= 0.2 * Math.max(0.1, 1 - distance * 10);
        this.quatFromVectors(
          this.snapTargetDirection,
          this.snapDirection,
          snapRotation,
          angleFactor,
        );
      }
    }

    const combined = quat.multiply(
      quat.create(),
      snapRotation,
      this.pointerRotation,
    );
    if (!combined.every(Number.isFinite)) {
      quat.identity(combined);
      quat.identity(this.pointerRotation);
    }
    quat.multiply(this.orientation, combined, this.orientation);
    quat.normalize(this.orientation, this.orientation);
    if (!this.orientation.every(Number.isFinite)) {
      quat.identity(this.orientation);
    }
    quat.slerp(
      this.smoothedRotation,
      this.smoothedRotation,
      combined,
      0.8 * timeScale,
    );
    if (!this.smoothedRotation.every(Number.isFinite)) {
      quat.identity(this.smoothedRotation);
    }

    const rotationW = Math.max(0, Math.min(1, Math.abs(this.smoothedRotation[3])));
    const radians = Math.acos(rotationW) * 2;
    const sine = Math.sin(radians / 2);
    let velocity = 0;
    if (sine > 0.000001) {
      velocity = radians / (2 * Math.PI);
      vec3.set(
        this.rotationAxis,
        this.smoothedRotation[0] / sine,
        this.smoothedRotation[1] / sine,
        this.smoothedRotation[2] / sine,
      );
    }
    this.rotationVelocity +=
      (velocity - this.rotationVelocity) * 0.5 * timeScale;
    this.updateCallback(deltaTime);
  }

  quatFromVectors(a, b, output, angleFactor) {
    const dot = Math.max(-1, Math.min(1, vec3.dot(a, b)));
    if (dot > 0.999999) {
      quat.identity(output);
      return;
    }

    const axis = vec3.cross(vec3.create(), a, b);
    if (vec3.squaredLength(axis) < 0.000001) {
      vec3.cross(axis, a, [1, 0, 0]);
      if (vec3.squaredLength(axis) < 0.000001) {
        vec3.cross(axis, a, [0, 1, 0]);
      }
    }
    vec3.normalize(axis, axis);
    const angle = Math.acos(dot);
    quat.setAxisAngle(output, axis, angle * angleFactor);
  }

  project(position) {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    const scale = Math.max(width, height) - 1;
    const x = (2 * position[0] - width - 1) / scale;
    const y = (2 * position[1] - height - 1) / scale;
    const square = x * x + y * y;
    const z = square <= 2 ? Math.sqrt(4 - square) : 4 / Math.sqrt(square);
    return vec3.fromValues(-x, y, z);
  }

  destroy() {
    this.abortController.abort();
  }
}

class InfiniteGridMenu {
  targetFrameDuration = 1000 / 60;
  sphereRadius = 2;
  previousTime = 0;
  smoothedRotationVelocity = 0;
  movementActive = false;
  frameRequest = 0;
  targetIndex = null;

  constructor(canvas, items, onActiveItemChange, onMovementChange, scale) {
    this.canvas = canvas;
    this.items = items;
    this.onActiveItemChange = onActiveItemChange;
    this.onMovementChange = onMovementChange;
    this.scaleFactor = scale;
    this.gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
    if (!this.gl) throw new Error("WebGL 2 is not available");

    this.camera = {
      matrix: mat4.create(),
      position: vec3.fromValues(0, 0, 3 * scale),
      up: vec3.fromValues(0, 1, 0),
      view: mat4.create(),
      projection: mat4.create(),
    };
    this.initialize();
  }

  initialize() {
    const gl = this.gl;
    this.program = createProgram(
      gl,
      discVertShaderSource,
      discFragShaderSource,
    );
    this.locations = {
      modelPosition: gl.getAttribLocation(this.program, "aModelPosition"),
      modelUvs: gl.getAttribLocation(this.program, "aModelUvs"),
      instanceMatrix: gl.getAttribLocation(this.program, "aInstanceMatrix"),
      world: gl.getUniformLocation(this.program, "uWorldMatrix"),
      view: gl.getUniformLocation(this.program, "uViewMatrix"),
      projection: gl.getUniformLocation(this.program, "uProjectionMatrix"),
      rotation: gl.getUniformLocation(this.program, "uRotationAxisVelocity"),
      texture: gl.getUniformLocation(this.program, "uTex"),
      atlasSize: gl.getUniformLocation(this.program, "uAtlasSize"),
    };

    const disc = new DiscGeometry();
    this.indices = new Uint16Array(
      disc.faces.flatMap((face) => [face.a, face.b, face.c]),
    );
    this.vertexArray = gl.createVertexArray();
    gl.bindVertexArray(this.vertexArray);

    const positions = makeBuffer(
      gl,
      new Float32Array(
        disc.vertices.flatMap((vertex) => Array.from(vertex.position)),
      ),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(this.locations.modelPosition);
    gl.vertexAttribPointer(
      this.locations.modelPosition,
      3,
      gl.FLOAT,
      false,
      0,
      0,
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, positions);

    const uvs = makeBuffer(
      gl,
      new Float32Array(
        disc.vertices.flatMap((vertex) => Array.from(vertex.uv)),
      ),
      gl.STATIC_DRAW,
    );
    gl.bindBuffer(gl.ARRAY_BUFFER, uvs);
    gl.enableVertexAttribArray(this.locations.modelUvs);
    gl.vertexAttribPointer(this.locations.modelUvs, 2, gl.FLOAT, false, 0, 0);

    const indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indices, gl.STATIC_DRAW);

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    this.instancePositions = this.items.map((_, index) => {
      const y = 1 - ((index + 0.5) / this.items.length) * 2;
      const radius = Math.sqrt(1 - y * y);
      const angle = index * goldenAngle;
      return vec3.fromValues(
        Math.cos(angle) * radius * this.sphereRadius,
        y * this.sphereRadius,
        Math.sin(angle) * radius * this.sphereRadius,
      );
    });
    const initialIndex = this.instancePositions.reduce(
      (nearest, position, index, positions) =>
        position[2] < positions[nearest][2] ? index : nearest,
      0,
    );
    [this.instancePositions[0], this.instancePositions[initialIndex]] = [
      this.instancePositions[initialIndex],
      this.instancePositions[0],
    ];
    this.instanceMatrices = new Float32Array(
      this.instancePositions.length * 16,
    );
    this.instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      this.instanceMatrices.byteLength,
      gl.DYNAMIC_DRAW,
    );

    for (let index = 0; index < 4; index += 1) {
      const location = this.locations.instanceMatrix + index;
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, 4, gl.FLOAT, false, 64, index * 16);
      gl.vertexAttribDivisor(location, 1);
    }
    gl.bindVertexArray(null);

    this.worldMatrix = mat4.create();
    this.initializeTexture();
    this.control = new ArcballControl(this.canvas, (deltaTime) =>
      this.onControlUpdate(deltaTime),
    );
    this.resize();
  }

  initializeTexture() {
    const gl = this.gl;
    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR_MIPMAP_LINEAR,
    );
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.atlasSize = Math.ceil(Math.sqrt(this.items.length));
    const atlas = document.createElement("canvas");
    const context = atlas.getContext("2d");
    const cellSize = 256;
    atlas.width = this.atlasSize * cellSize;
    atlas.height = this.atlasSize * cellSize;
    context.fillStyle = "#151813";
    context.fillRect(0, 0, atlas.width, atlas.height);

    Promise.all(
      this.items.map(
        (item) =>
          new Promise((resolve) => {
            if (!item.image) return resolve(null);
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.onload = () => resolve(image);
            image.onerror = () => resolve(null);
            image.src = item.image;
          }),
      ),
    ).then((images) => {
      images.forEach((image, index) => {
        const x = (index % this.atlasSize) * cellSize;
        const y = Math.floor(index / this.atlasSize) * cellSize;
        if (image) {
          const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
          const sourceX = (image.naturalWidth - sourceSize) / 2;
          const sourceY = (image.naturalHeight - sourceSize) / 2;
          context.drawImage(
            image,
            sourceX,
            sourceY,
            sourceSize,
            sourceSize,
            x,
            y,
            cellSize,
            cellSize,
          );
        } else {
          context.fillStyle = "#b8ff57";
          context.font = "700 42px sans-serif";
          context.fillText(String(index + 1).padStart(2, "0"), x + 24, y + 62);
        }
      });
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        atlas,
      );
      gl.generateMipmap(gl.TEXTURE_2D);
    });
  }

  resize() {
    const gl = this.gl;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(this.canvas.clientWidth * ratio);
    const height = Math.round(this.canvas.clientHeight * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
    const distance = this.camera.position[2];
    const viewHeight = this.sphereRadius * 0.35;
    const fov =
      aspect > 1
        ? 2 * Math.atan(viewHeight / distance)
        : 2 * Math.atan(viewHeight / aspect / distance);
    mat4.perspective(this.camera.projection, fov, aspect, 0.1, 40);
  }

  run = (time = 0) => {
    const deltaTime = Math.min(32, time - this.previousTime);
    this.previousTime = time;
    this.control.update(deltaTime, this.targetFrameDuration);
    this.animate();
    this.render();
    this.frameRequest = requestAnimationFrame(this.run);
  };

  animate() {
    const gl = this.gl;
    const matrices = this.instancePositions.map((position) =>
      vec3.transformQuat(vec3.create(), position, this.control.orientation),
    );
    matrices.forEach((position, index) => {
      const depthScale =
        (Math.abs(position[2]) / this.sphereRadius) * 0.55 + 0.45;
      const matrix = mat4.create();
      mat4.translate(matrix, matrix, vec3.negate(vec3.create(), position));
      mat4.multiply(
        matrix,
        matrix,
        mat4.targetTo(mat4.create(), [0, 0, 0], position, [0, 1, 0]),
      );
      mat4.scale(matrix, matrix, [0.18 * depthScale, 0.18 * depthScale, 0.18]);
      mat4.translate(matrix, matrix, [0, 0, -this.sphereRadius]);
      this.instanceMatrices.set(matrix, index * 16);
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceMatrices);
    this.smoothedRotationVelocity = this.control.rotationVelocity;
  }

  render() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(this.locations.world, false, this.worldMatrix);
    gl.uniformMatrix4fv(this.locations.view, false, this.camera.view);
    gl.uniformMatrix4fv(
      this.locations.projection,
      false,
      this.camera.projection,
    );
    gl.uniform4f(
      this.locations.rotation,
      this.control.rotationAxis[0],
      this.control.rotationAxis[1],
      this.control.rotationAxis[2],
      this.smoothedRotationVelocity * 1.1,
    );
    gl.uniform1i(this.locations.atlasSize, this.atlasSize);
    gl.uniform1i(this.locations.texture, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.bindVertexArray(this.vertexArray);
    gl.drawElementsInstanced(
      gl.TRIANGLES,
      this.indices.length,
      gl.UNSIGNED_SHORT,
      0,
      this.instancePositions.length,
    );
  }

  navigate(offset) {
    const currentIndex = this.targetIndex ?? this.findNearestVertexIndex();
    this.targetIndex =
      (currentIndex + offset + this.items.length) % this.items.length;
    this.onActiveItemChange(this.targetIndex);
    this.control.snapTargetDirection = vec3.normalize(
      vec3.create(),
      vec3.transformQuat(
        vec3.create(),
        this.instancePositions[this.targetIndex],
        this.control.orientation,
      ),
    );
  }

  onControlUpdate(deltaTime) {
    const timeScale = deltaTime / this.targetFrameDuration + 0.0001;
    let damping = 5 / timeScale;
    let targetZ = 3 * this.scaleFactor;
    const moving =
      this.control.isPointerDown ||
      Math.abs(this.smoothedRotationVelocity) > 0.01;
    if (moving !== this.movementActive) {
      this.movementActive = moving;
      this.onMovementChange(moving);
    }

    if (!this.control.isPointerDown) {
      const nearestIndex = this.targetIndex ?? this.findNearestVertexIndex();
      this.onActiveItemChange(nearestIndex);
      this.control.snapTargetDirection = vec3.normalize(
        vec3.create(),
        vec3.transformQuat(
          vec3.create(),
          this.instancePositions[nearestIndex],
          this.control.orientation,
        ),
      );
      if (
        this.targetIndex !== null &&
        vec3.squaredDistance(
          this.control.snapTargetDirection,
          this.control.snapDirection,
        ) < 0.0001
      ) {
        this.targetIndex = null;
      }
    } else {
      this.targetIndex = null;
      const zoomVelocity = Number.isFinite(this.control.rotationVelocity)
        ? Math.min(Math.abs(this.control.rotationVelocity), 0.08)
        : 0;
      targetZ += zoomVelocity * 80 + 2.5;
      damping = 7 / timeScale;
    }
    this.camera.position[2] += (targetZ - this.camera.position[2]) / damping;
    if (!Number.isFinite(this.camera.position[2])) {
      this.camera.position[2] = 3 * this.scaleFactor;
    }
    mat4.targetTo(
      this.camera.matrix,
      this.camera.position,
      [0, 0, 0],
      this.camera.up,
    );
    mat4.invert(this.camera.view, this.camera.matrix);
  }

  findNearestVertexIndex() {
    const inverse = quat.conjugate(quat.create(), this.control.orientation);
    const direction = vec3.transformQuat(
      vec3.create(),
      this.control.snapDirection,
      inverse,
    );
    let nearestIndex = 0;
    let maximumDot = -1;
    this.instancePositions.forEach((position, index) => {
      const dot = vec3.dot(direction, position);
      if (dot > maximumDot) {
        maximumDot = dot;
        nearestIndex = index;
      }
    });
    return nearestIndex;
  }

  destroy() {
    cancelAnimationFrame(this.frameRequest);
    this.control.destroy();
  }
}

export default function InfiniteMenu({
  items = [],
  scale = 1,
  backgroundColor = "#080908",
  selectedItemId,
  onItemSelect,
  onMovementChange,
}) {
  const canvasRef = useRef(null);
  const menuRef = useRef(null);
  const [activeItem, setActiveItem] = useState(null);
  const [isMoving, setIsMoving] = useState(false);
  const [webglError, setWebglError] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || items.length === 0) return undefined;
    let menu;
    try {
      menu = new InfiniteGridMenu(
        canvasRef.current,
        items,
        (index) => setActiveItem(items[index]),
        (moving) => {
          setIsMoving(moving);
          onMovementChange?.(moving);
        },
        scale,
      );
      menuRef.current = menu;
      menu.run();
    } catch (error) {
      console.error(error);
      setWebglError(true);
    }

    const resize = () => menu?.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      menu?.destroy();
      if (menuRef.current === menu) menuRef.current = null;
    };
  }, [items, scale]);

  if (items.length === 0) return null;

  if (webglError) {
    return (
      <div className="menu-fallback">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onItemSelect?.(item)}
          >
            <img src={item.image} alt="" />
            <span>{item.title}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className="infinite-menu"
      style={{ backgroundColor, "--menu-background": backgroundColor }}
    >
      <Particles
        className="menu-particles"
        particleColors={backgroundParticleColors}
        particleCount={200}
        particleSpread={10}
        speed={0.1}
        particleBaseSize={120}
        moveParticlesOnHover
        particleHoverFactor={0.8}
      />
      <canvas
        ref={canvasRef}
        aria-label="Interactive globe of the top one hundred albums"
        onClick={() => !isMoving && activeItem && onItemSelect?.(activeItem)}
      />

      {activeItem && (
        <>
          <div className={`album-caption ${isMoving ? "inactive" : "active"}`}>
            <span className="album-rank">#{activeItem.rank}</span>
            <h2>{activeItem.title}</h2>
            <p>{activeItem.artist}</p>
          </div>
          <p className={`play-count ${isMoving ? "inactive" : "active"}`}>
            <strong>
              <CountUp
                key={activeItem.id}
                from={0}
                to={activeItem.playCount}
                separator=","
                duration={1}
                className="count-up-text"
              />
            </strong>
            <span>plays</span>
          </p>
          <button
            type="button"
            className={`view-album ${isMoving ? "inactive" : "active"}`}
            onClick={() => onItemSelect?.(activeItem)}
            aria-expanded={selectedItemId === activeItem.id}
          >
            <span>
              {selectedItemId === activeItem.id ? "Close tracks" : "View tracks"}
            </span>
            <span aria-hidden="true">
              {selectedItemId === activeItem.id ? "×" : "↗"}
            </span>
          </button>
        </>
      )}

      <button
        type="button"
        className="globe-navigation previous"
        onClick={() => menuRef.current?.navigate(-1)}
        aria-label="Previous album"
      >
        <span aria-hidden="true">←</span>
      </button>
      <button
        type="button"
        className="globe-navigation next"
        onClick={() => menuRef.current?.navigate(1)}
        aria-label="Next album"
      >
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

// Three.js Interactive 3D Neural Agent Network Scene
// Built for Toolcall Theater

let scene, camera, renderer;
let agentNodes = {};
let connectionLines = [];
let particlesMesh;
let orbitalRings = [];
let coreSphere;
let container;

// Node metadata for positioning
const NODE_CONFIG = {
  Coordinator: { pos: [0, 2.5, 0], color: 0xa855f7, label: "Coordinator", size: 0.5 },
  Researcher: { pos: [-3, 0.5, -1], color: 0x06b6d4, label: "Researcher (Alice)", size: 0.4 },
  Programmer: { pos: [3, 0.5, -1], color: 0x3b82f6, label: "Programmer (Bob)", size: 0.4 },
  Reviewer: { pos: [0, -2, -1], color: 0xec4899, label: "Reviewer (Charlie)", size: 0.4 },
  websearch: { pos: [-4.5, 1.5, 0], color: 0x10b981, label: "Web Search Tool", size: 0.25, parent: "Researcher" },
  browser: { pos: [-4.5, -1.0, 0], color: 0x10b981, label: "Browser Tool", size: 0.25, parent: "Researcher" },
  filesystem: { pos: [4.5, 1.5, 0], color: 0xf59e0b, label: "FileSystem Tool", size: 0.25, parent: "Programmer" },
  python: { pos: [4.5, -1.0, 0], color: 0xf59e0b, label: "Python Tool", size: 0.25, parent: "Programmer" },
  shell: { pos: [3.0, 2.2, -1], color: 0xf59e0b, label: "Shell Tool", size: 0.25, parent: "Programmer" }
};

export function initThreeScene(canvasContainerId) {
  container = document.getElementById(canvasContainerId);
  if (!container) return;

  // 1. Scene & Camera Setup
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0518, 0.05);

  const width = container.clientWidth;
  const height = container.clientHeight;
  camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
  camera.position.z = 7;

  // 2. Renderer Setup
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.innerHTML = ""; // Clear loader if any
  container.appendChild(renderer.domElement);

  // 3. Lighting Setup
  const ambientLight = new THREE.AmbientLight(0x221144, 1.5);
  scene.add(ambientLight);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 2);
  dirLight1.position.set(5, 10, 7);
  scene.add(dirLight1);

  const coreLight = new THREE.PointLight(0xa855f7, 5, 15);
  coreLight.position.set(0, 0, 0);
  scene.add(coreLight);

  // 4. Glowing Central AI Core
  const coreGeo = new THREE.IcosahedronGeometry(0.8, 2);
  const coreMat = new THREE.MeshPhongMaterial({
    color: 0x7c3aed,
    emissive: 0x4c1d95,
    wireframe: true,
    transparent: true,
    opacity: 0.8
  });
  coreSphere = new THREE.Mesh(coreGeo, coreMat);
  scene.add(coreSphere);

  // Add orbital rings to core
  for (let i = 0; i < 3; i++) {
    const ringGeo = new THREE.RingGeometry(1.2 + i * 0.3, 1.25 + i * 0.3, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xa855f7,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3 - i * 0.08,
      wireframe: true
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.random() * Math.PI;
    ring.rotation.y = Math.random() * Math.PI;
    scene.add(ring);
    orbitalRings.push(ring);
  }

  // 5. Build Agent & Tool Nodes
  Object.entries(NODE_CONFIG).forEach(([name, cfg]) => {
    // Sphere representing the node
    const geom = new THREE.SphereGeometry(cfg.size, 16, 16);
    const mat = new THREE.MeshPhongMaterial({
      color: cfg.color,
      emissive: cfg.color,
      emissiveIntensity: 0.2,
      shininess: 30,
      transparent: true,
      opacity: 0.9
    });
    const nodeObj = new THREE.Mesh(geom, mat);
    nodeObj.position.set(...cfg.pos);
    scene.add(nodeObj);
    agentNodes[name] = nodeObj;

    // Node label helper / position indicator
    nodeObj.userData = {
      name,
      baseColor: cfg.color,
      baseSize: cfg.size,
      parent: cfg.parent
    };

    // Draw connection lines to central core or parent
    let lineMat = new THREE.LineBasicMaterial({
      color: cfg.color,
      transparent: true,
      opacity: 0.4,
      linewidth: 1
    });

    const targetPos = cfg.parent ? NODE_CONFIG[cfg.parent].pos : [0, 0, 0];
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...cfg.pos),
      new THREE.Vector3(...targetPos)
    ]);
    const line = new THREE.Line(lineGeo, lineMat);
    scene.add(line);
    connectionLines.push({ line, color: cfg.color, name });
  });

  // 6. Background Starfield / Particle Cloud
  const particleGeo = new THREE.BufferGeometry();
  const particleCount = 250;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);

  const colOptions = [new THREE.Color(0xa855f7), new THREE.Color(0x3b82f6), new THREE.Color(0xec4899)];

  for (let i = 0; i < particleCount * 3; i += 3) {
    // Spherical distribution
    const r = 5 + Math.random() * 8;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 2 - 1);

    positions[i] = r * Math.sin(phi) * Math.cos(theta);
    positions[i + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i + 2] = r * Math.cos(phi);

    // Color variation
    const c = colOptions[Math.floor(Math.random() * colOptions.length)];
    colors[i] = c.r;
    colors[i + 1] = c.g;
    colors[i + 2] = c.b;
  }

  particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  // Small square texture / dot for particles
  const particleMat = new THREE.PointsMaterial({
    size: 0.08,
    vertexColors: true,
    transparent: true,
    opacity: 0.6
  });

  particlesMesh = new THREE.Points(particleGeo, particleMat);
  scene.add(particlesMesh);

  // 7. Mouse Interaction Parallax Setup
  let mouseX = 0, mouseY = 0;
  window.addEventListener("mousemove", (e) => {
    mouseX = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
    mouseY = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
  });

  // Window resizing
  window.addEventListener("resize", onWindowResize);

  // 8. Animation Loop
  let clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const elapsed = clock.getElapsedTime();

    // Slow rotation of central core and orbital rings
    if (coreSphere) {
      coreSphere.rotation.y = elapsed * 0.15;
      coreSphere.rotation.x = elapsed * 0.08;
    }
    orbitalRings.forEach((ring, idx) => {
      ring.rotation.z = elapsed * (0.05 * (idx + 1));
      ring.rotation.x += Math.sin(elapsed * 0.01) * 0.001;
    });

    // Node floating animation
    Object.entries(agentNodes).forEach(([name, node]) => {
      const idx = name.charCodeAt(0);
      node.position.y = NODE_CONFIG[name].pos[1] + Math.sin(elapsed * 0.8 + idx) * 0.15;
      node.position.x = NODE_CONFIG[name].pos[0] + Math.cos(elapsed * 0.5 + idx) * 0.1;
    });

    // Update connection line positions to follow floating nodes
    connectionLines.forEach(({ line, name }) => {
      const node = agentNodes[name];
      const cfg = NODE_CONFIG[name];
      const parentNode = cfg.parent ? agentNodes[cfg.parent] : null;

      const posAttribute = line.geometry.attributes.position;
      if (node && posAttribute) {
        posAttribute.setXYZ(0, node.position.x, node.position.y, node.position.z);
        if (parentNode) {
          posAttribute.setXYZ(1, parentNode.position.x, parentNode.position.y, parentNode.position.z);
        } else {
          posAttribute.setXYZ(1, 0, 0, 0); // Core center
        }
        posAttribute.needsUpdate = true;
      }
    });

    // Particle cloud drift
    if (particlesMesh) {
      particlesMesh.rotation.y = elapsed * -0.02;
      particlesMesh.rotation.x = elapsed * 0.01;
    }

    // Parallax effect using mouse
    camera.position.x += (mouseX * 1.5 - camera.position.x) * 0.05;
    camera.position.y += (-mouseY * 1.5 - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  animate();
}

function onWindowResize() {
  if (!container || !camera || !renderer) return;
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

// Highlight a node on the scene during agent events
export function highlightNode(nodeName) {
  if (!agentNodes) return;
  const normalized = nodeName.toLowerCase();
  
  // Find matching node
  let targetNode = null;
  let targetName = "";

  Object.entries(agentNodes).forEach(([name, node]) => {
    if (name.toLowerCase() === normalized || normalized.includes(name.toLowerCase())) {
      targetNode = node;
      targetName = name;
    }
  });

  if (!targetNode) return;

  // Pulse effect
  let scale = 1.0;
  const originalSize = targetNode.userData.baseSize;

  const pulseInterval = setInterval(() => {
    scale += 0.1;
    targetNode.scale.set(scale, scale, scale);
    targetNode.material.emissiveIntensity = 2.0;

    if (scale >= 1.6) {
      clearInterval(pulseInterval);
      // Reset back slowly
      const shrinkInterval = setInterval(() => {
        scale -= 0.05;
        if (scale <= 1.0) {
          targetNode.scale.set(1, 1, 1);
          targetNode.material.emissiveIntensity = 0.2;
          clearInterval(shrinkInterval);
        } else {
          targetNode.scale.set(scale, scale, scale);
        }
      }, 30);
    }
  }, 20);

  // Flash connection line
  const matchingLine = connectionLines.find(cl => cl.name === targetName);
  if (matchingLine) {
    const originalColor = matchingLine.color;
    matchingLine.line.material.color.setHex(0xffffff);
    matchingLine.line.material.opacity = 1.0;
    setTimeout(() => {
      matchingLine.line.material.color.setHex(originalColor);
      matchingLine.line.material.opacity = 0.4;
    }, 1500);
  }
}

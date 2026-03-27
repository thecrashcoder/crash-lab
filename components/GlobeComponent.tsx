'use client';

import * as THREE from 'three';
import { useEffect, useRef, useState } from 'react';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Moon, Sun } from 'lucide-react';

export function GlobeComponent() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const isDarkModeRef = useRef(isDarkMode);

  useEffect(() => {
    isDarkModeRef.current = isDarkMode;
  }, [isDarkMode]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    let width = container.offsetWidth || window.innerWidth;
    let height = container.offsetHeight || window.innerHeight;

    const scene = new THREE.Scene();
    // Background is transparent so the HTML text behind it shows through

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 2000);
    camera.position.z = 400;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enablePan = false;
    controls.minDistance = 150;
    controls.maxDistance = 600;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.8;

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const radius = 100;

    // 1. Inner Glow Sphere (Fresnel effect)
    const innerGeo = new THREE.SphereGeometry(radius * 0.98, 64, 64);
    const innerMat = new THREE.ShaderMaterial({
      uniforms: {
        color1: { value: new THREE.Color(isDarkModeRef.current ? 0x000000 : 0xffffff) },
        color2: { value: new THREE.Color(isDarkModeRef.current ? 0x222222 : 0xd0d5d9) }, // Edge shadow color
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 color1;
        uniform vec3 color2;
        varying vec3 vNormal;
        void main() {
          float intensity = pow(1.0 - dot(vNormal, vec3(0, 0, 1.0)), 2.5);
          gl_FragColor = vec4(mix(color1, color2, intensity), 1.0);
        }
      `,
      transparent: false,
    });
    const innerSphere = new THREE.Mesh(innerGeo, innerMat);
    globeGroup.add(innerSphere);

    // 2. Load Earth Map and Create Dots
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.src = "https://unpkg.com/three-globe/example/img/earth-water.png";
    
    let pointsMaterial: THREE.PointsMaterial | null = null;
    const createPoints = (imgData?: ImageData) => {
      const points = [];
      const numPoints = 80000;
      const phi = Math.PI * (3 - Math.sqrt(5));

      for (let i = 0; i < numPoints; i++) {
        const y = 1 - (i / (numPoints - 1)) * 2;
        const radiusAtY = Math.sqrt(1 - y * y);
        const theta = phi * i;

        const x = Math.cos(theta) * radiusAtY;
        const z = Math.sin(theta) * radiusAtY;

        if (imgData) {
          const u = 0.5 + Math.atan2(z, x) / (2 * Math.PI);
          const v = 0.5 - Math.asin(y) / Math.PI;

          const px = Math.floor(u * imgData.width);
          const py = Math.floor(v * imgData.height);
          const index = (py * imgData.width + px) * 4;
          
          if (imgData.data[index] < 128) { 
            points.push(new THREE.Vector3(x, y, z).multiplyScalar(radius));
          }
        } else {
          // Fallback: just a uniform sphere if image fails
          points.push(new THREE.Vector3(x, y, z).multiplyScalar(radius));
        }
      }

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      
      const dotCanvas = document.createElement('canvas');
      dotCanvas.width = 32;
      dotCanvas.height = 32;
      const dotCtx = dotCanvas.getContext('2d');
      if (dotCtx) {
        dotCtx.beginPath();
        dotCtx.arc(16, 16, 16, 0, Math.PI * 2);
        dotCtx.fillStyle = '#ffffff'; // Always draw white, we'll tint it
        dotCtx.fill();
      }
      const dotTexture = new THREE.CanvasTexture(dotCanvas);

      pointsMaterial = new THREE.PointsMaterial({
        color: isDarkModeRef.current ? 0xffffff : 0x111111,
        size: 1.2,
        sizeAttenuation: true,
        map: dotTexture,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      });

      const pointsSphere = new THREE.Points(geometry, pointsMaterial);
      globeGroup.add(pointsSphere);
    };

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        createPoints();
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        createPoints(imgData);
      } catch (e) {
        console.error("Failed to get image data (CORS issue?). Falling back.", e);
        createPoints();
      }
    };

    img.onerror = () => {
      console.error("Failed to load Earth specular map. Falling back to uniform sphere.");
      createPoints();
    };

    // 3. Add Markers and Connections
    const markerLocations = [
      { lat: 51.5074, lng: -0.1278, name: "London" },
      { lat: 37.7749, lng: -122.4194, name: "San Francisco" },
      { lat: 35.6762, lng: 139.6503, name: "Tokyo" },
      { lat: -33.8688, lng: 151.2093, name: "Sydney" },
    ];

    const getCoordinates = (lat: number, lng: number, r: number) => {
      const latRad = lat * (Math.PI / 180);
      const lngRad = lng * (Math.PI / 180);
      return new THREE.Vector3(
        r * Math.cos(latRad) * Math.cos(lngRad),
        r * Math.sin(latRad),
        r * Math.cos(latRad) * Math.sin(lngRad)
      );
    };

    const markersGroup = new THREE.Group();
    globeGroup.add(markersGroup);

    const markerPositions: THREE.Vector3[] = [];
    const labelElements: { element: HTMLDivElement, position: THREE.Vector3 }[] = [];

    // Create a container for labels
    const labelsContainer = document.createElement('div');
    labelsContainer.style.position = 'absolute';
    labelsContainer.style.top = '0';
    labelsContainer.style.left = '0';
    labelsContainer.style.width = '100%';
    labelsContainer.style.height = '100%';
    labelsContainer.style.pointerEvents = 'none';
    labelsContainer.style.overflow = 'hidden';
    container.appendChild(labelsContainer);

    markerLocations.forEach(loc => {
      const pos = getCoordinates(loc.lat, loc.lng, radius * 1.01);
      markerPositions.push(pos);

      // Label
      const label = document.createElement('div');
      label.textContent = loc.name;
      label.style.position = 'absolute';
      label.style.color = isDarkModeRef.current ? '#ffffff' : '#000000';
      label.style.fontFamily = 'var(--font-sans), sans-serif';
      label.style.fontSize = '12px';
      label.style.fontWeight = '500';
      label.style.letterSpacing = '0.05em';
      label.style.padding = '2px 6px';
      label.style.background = isDarkModeRef.current ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.7)';
      label.style.backdropFilter = 'blur(4px)';
      label.style.borderRadius = '4px';
      label.style.transform = 'translate(-50%, -150%)'; // Center horizontally, place above dot
      label.style.transition = 'opacity 0.2s ease, color 0.5s ease, background-color 0.5s ease';
      label.style.opacity = '0'; // Start hidden until first render
      labelsContainer.appendChild(label);

      labelElements.push({ element: label, position: pos });
    });

    // Initial rotation removed to keep the globe balanced
    globeGroup.rotation.y = 0;
    globeGroup.rotation.x = 0;

    // 4. Add Text Rings (Saturn Rings)
    const ringsGroup = new THREE.Group();
    scene.add(ringsGroup);

    let ringMaterial: THREE.MeshBasicMaterial | null = null;
    const createTextRing = (text: string, ringRadius: number, repeat: number, opacity: number) => {
      const canvas = document.createElement('canvas');
      const size = 1024;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return new THREE.Mesh();

      ctx.clearRect(0, 0, size, size);
      
      const fullText = text.repeat(repeat);
      
      ctx.font = 'bold 24px monospace';
      ctx.fillStyle = '#ffffff'; // Always draw white text, tint via material
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      const center = size / 2;
      const outerR = ringRadius * 1.15;
      const innerR = ringRadius * 0.85;
      const textRadius = center * (ringRadius / outerR);
      
      ctx.translate(center, center);
      
      let totalWidth = 0;
      for (let i = 0; i < fullText.length; i++) {
        totalWidth += ctx.measureText(fullText[i]).width;
      }
      
      let currentAngle = 0;
      for (let i = 0; i < fullText.length; i++) {
        const char = fullText[i];
        const charWidth = ctx.measureText(char).width;
        const charAngle = (charWidth / totalWidth) * (Math.PI * 2);
        
        ctx.save();
        ctx.rotate(currentAngle + charAngle / 2);
        ctx.translate(0, -textRadius);
        ctx.fillText(char, 0, 0);
        ctx.restore();
        
        currentAngle += charAngle;
      }

      const texture = new THREE.CanvasTexture(canvas);
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

      const geometry = new THREE.RingGeometry(innerR, outerR, 128);
      ringMaterial = new THREE.MeshBasicMaterial({
        color: isDarkModeRef.current ? 0xffffff : 0x000000,
        map: texture,
        transparent: true,
        opacity: opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      const ring = new THREE.Mesh(geometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      return ring;
    };

    const ring1 = createTextRing(" PAY FASTER • ", radius * 1.6, 10, 0.9);
    ringsGroup.add(ring1);

    let animationFrameId: number;
    let lastIsDark = isDarkModeRef.current;
    let spinVelocity = 0;
    
    const targetColor1 = new THREE.Color();
    const targetColor2 = new THREE.Color();
    const targetPoints = new THREE.Color();
    const targetAccent = new THREE.Color();

    const render = () => {
      controls.update();
      
      const isDark = isDarkModeRef.current;
      
      // Orbit spin effect on toggle
      if (isDark !== lastIsDark) {
        spinVelocity = 0.15;
        lastIsDark = isDark;
      }
      
      if (spinVelocity > 0.001) {
        globeGroup.rotation.y += spinVelocity;
        spinVelocity *= 0.92; // friction
      }

      // Smooth color lerping
      const lerpFactor = 0.05;

      targetColor1.setHex(isDark ? 0x000000 : 0xffffff);
      innerMat.uniforms.color1.value.lerp(targetColor1, lerpFactor);

      targetColor2.setHex(isDark ? 0x222222 : 0xd0d5d9);
      innerMat.uniforms.color2.value.lerp(targetColor2, lerpFactor);

      targetPoints.setHex(isDark ? 0xffffff : 0x111111);
      if (pointsMaterial) pointsMaterial.color.lerp(targetPoints, lerpFactor);

      targetAccent.setHex(isDark ? 0xffffff : 0x000000);
      if (ringMaterial) ringMaterial.color.lerp(targetAccent, lerpFactor);

      // Rotate ring
      ring1.rotation.z -= 0.002;
      
      // Update label positions
      const tempV = new THREE.Vector3();
      labelElements.forEach(item => {
        // Get the world position of the marker
        tempV.copy(item.position);
        globeGroup.localToWorld(tempV);
        
        // Check if the point is on the visible side of the globe
        const distanceToCamera = camera.position.distanceTo(tempV);
        const isVisible = distanceToCamera < camera.position.distanceTo(globeGroup.position);

        if (isVisible) {
          // Project to 2D screen space
          tempV.project(camera);
          
          const x = (tempV.x *  .5 + .5) * width;
          const y = (tempV.y * -.5 + .5) * height;
          
          item.element.style.left = `${x}px`;
          item.element.style.top = `${y}px`;
          item.element.style.opacity = '1';
          item.element.style.color = isDark ? '#ffffff' : '#000000';
          item.element.style.background = isDark ? 'rgba(0, 0, 0, 0.7)' : 'rgba(255, 255, 255, 0.7)';
        } else {
          item.element.style.opacity = '0';
        }
      });

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(render);
    };
    render();

    const onResize = () => {
      if (!containerRef.current) return;
      width = containerRef.current.offsetWidth || window.innerWidth;
      height = containerRef.current.offsetHeight || window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animationFrameId);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      if (container.contains(labelsContainer)) {
        container.removeChild(labelsContainer);
      }
      renderer.dispose();
    };
  }, []); // Empty dependency array so scene is not recreated

  return (
    <div className={`relative w-full h-full transition-colors duration-500 ${isDarkMode ? 'bg-black' : 'bg-white'} overflow-hidden`}>
      
      <div ref={containerRef} className="absolute inset-0 cursor-grab active:cursor-grabbing z-0" />
      
      {/* ZAPP Striped Text Foreground */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <h1 
          className="font-black uppercase text-center select-none"
          style={{
            fontSize: '96px',
            lineHeight: 0.8,
            letterSpacing: '0.1em',
            backgroundImage: `repeating-linear-gradient(
              to bottom,
              ${isDarkMode ? '#ffffff' : '#000000'},
              ${isDarkMode ? '#ffffff' : '#000000'} 3px,
              transparent 3px,
              transparent 6px
            )`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
          }}
        >
          ZAPP
        </h1>
      </div>
      
      <button 
        onClick={() => setIsDarkMode(!isDarkMode)}
        className={`absolute top-8 right-12 p-3 rounded-full border transition-colors z-10 flex items-center justify-center ${
          isDarkMode 
            ? 'border-white/20 text-white hover:bg-white/10' 
            : 'border-black/20 text-black hover:bg-black/10'
        }`}
        aria-label="Toggle Dark Mode"
      >
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>
    </div>
  );
}

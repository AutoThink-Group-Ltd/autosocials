import { useEffect, useRef } from "react";
import { motion } from "framer-motion";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  type: "brand" | "creator" | "content" | "audience";
  label: string;
}

const CreatorNetworkViz = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const nodesRef = useRef<Node[]>([]);
  const isDarkRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    // Initialize nodes
    const w = canvas.getBoundingClientRect().width;
    const h = canvas.getBoundingClientRect().height;
    const cx = w / 2;
    const cy = h / 2;

    const creatorNames = ["SC", "MJ", "AP", "JR", "EL", "CM", "PS", "TB", "LK", "RD", "NK", "AW"];
    
    nodesRef.current = [
      // Brand node (center)
      { x: cx, y: cy, vx: 0, vy: 0, radius: 24, type: "brand", label: "A" },
      // Creator nodes (inner ring)
      ...creatorNames.slice(0, 6).map((label, i) => {
        const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
        const dist = 100 + Math.random() * 40;
        return {
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 0.3,
          vy: (Math.random() - 0.5) * 0.3,
          radius: 10 + Math.random() * 6,
          type: "creator" as const,
          label,
        };
      }),
      // Content/audience nodes (outer ring)
      ...creatorNames.slice(6).map((label, i) => {
        const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const dist = 170 + Math.random() * 50;
        return {
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          radius: 6 + Math.random() * 4,
          type: "audience" as const,
          label,
        };
      }),
    ];

    // Observe dark mode changes
    const observer = new MutationObserver(() => {
      isDarkRef.current = document.documentElement.classList.contains("dark");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    isDarkRef.current = document.documentElement.classList.contains("dark");

    let time = 0;
    const animate = () => {
      const dark = isDarkRef.current;
      const boost = dark ? 2.5 : 1; // opacity multiplier for dark mode
      const rect = canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      ctx.clearRect(0, 0, w, h);
      time += 0.008;

      const nodes = nodesRef.current;
      const brand = nodes[0];
      if (!brand) return;

      // Update positions with gentle floating
      nodes.forEach((node, i) => {
        if (i === 0) return; // skip brand
        node.x += node.vx + Math.sin(time + i) * 0.15;
        node.y += node.vy + Math.cos(time + i * 0.7) * 0.15;

        // Soft boundary
        const cx = w / 2;
        const cy = h / 2;
        const dx = node.x - cx;
        const dy = node.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const maxDist = node.type === "creator" ? 160 : 220;
        if (dist > maxDist) {
          node.x -= dx * 0.01;
          node.y -= dy * 0.01;
        }
      });

      // Draw connections
      nodes.forEach((node, i) => {
        if (i === 0) return;
        // Connect to brand
        const dx = brand.x - node.x;
        const dy = brand.y - node.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const opacity = Math.max(0, 1 - dist / 250) * 0.15 * boost;

        ctx.beginPath();
        ctx.moveTo(brand.x, brand.y);
        ctx.lineTo(node.x, node.y);
        ctx.strokeStyle = `hsla(330, 80%, ${dark ? '65%' : '52%'}, ${opacity})`;
        ctx.lineWidth = dark ? 1.5 : 1;
        ctx.stroke();

        // Connect creators to nearby creators
        nodes.forEach((other, j) => {
          if (j <= i || j === 0) return;
          const dx2 = other.x - node.x;
          const dy2 = other.y - node.y;
          const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
          if (dist2 < 120) {
            const op2 = Math.max(0, 1 - dist2 / 120) * 0.08 * boost;
            ctx.beginPath();
            ctx.moveTo(node.x, node.y);
            ctx.lineTo(other.x, other.y);
            ctx.strokeStyle = `hsla(280, 60%, ${dark ? '65%' : '55%'}, ${op2})`;
            ctx.lineWidth = dark ? 1 : 0.5;
            ctx.stroke();
          }
        });
      });

      // Draw nodes
      nodes.forEach((node, i) => {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

        if (node.type === "brand") {
          const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius);
          grad.addColorStop(0, `hsl(330, 80%, ${dark ? '60%' : '55%'})`);
          grad.addColorStop(1, `hsl(280, 60%, ${dark ? '55%' : '50%'})`);
          ctx.fillStyle = grad;
        } else if (node.type === "creator") {
          const base = dark ? 0.35 : 0.15;
          const swing = dark ? 0.1 : 0.05;
          ctx.fillStyle = `hsla(330, 70%, ${dark ? '60%' : '52%'}, ${base + Math.sin(time + i) * swing})`;
        } else {
          const base = dark ? 0.25 : 0.1;
          const swing = dark ? 0.08 : 0.03;
          ctx.fillStyle = `hsla(280, 50%, ${dark ? '65%' : '55%'}, ${base + Math.sin(time + i) * swing})`;
        }
        ctx.fill();

        // Label for brand
        if (node.type === "brand") {
          ctx.fillStyle = "white";
          ctx.font = "bold 16px Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(node.label, node.x, node.y);
        }

        // Small pulse on creator nodes
        if (node.type === "creator") {
          const pulseR = node.radius + 4 + Math.sin(time * 2 + i) * 2;
          ctx.beginPath();
          ctx.arc(node.x, node.y, pulseR, 0, Math.PI * 2);
          ctx.strokeStyle = `hsla(330, 70%, ${dark ? '60%' : '52%'}, ${(0.06 + Math.sin(time + i) * 0.02) * boost})`;
          ctx.lineWidth = dark ? 1.5 : 1;
          ctx.stroke();
        }
      });

      // Flowing particles along connections
      const particleCount = 3;
      for (let p = 0; p < particleCount; p++) {
        const creatorIdx = 1 + (Math.floor(time * 2 + p * 2) % (nodes.length - 1));
        const creator = nodes[creatorIdx];
        if (!creator) continue;
        const t = ((time * 0.5 + p * 0.33) % 1);
        const px = brand.x + (creator.x - brand.x) * t;
        const py = brand.y + (creator.y - brand.y) * t;
        ctx.beginPath();
        ctx.arc(px, py, dark ? 3 : 2, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(330, 80%, ${dark ? '65%' : '52%'}, ${(dark ? 0.6 : 0.3) * (1 - t)})`;
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", resize);
      observer.disconnect();
    };
  }, []);

  return (
    <motion.div
      className="relative w-full h-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1.5, delay: 0.5 }}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{ display: "block" }}
      />
      {/* Labels floating around */}
      <div className="absolute top-4 left-8 text-[10px] font-medium text-muted-foreground/60 tracking-wider uppercase">Creators</div>
      <div className="absolute bottom-4 right-8 text-[10px] font-medium text-muted-foreground/60 tracking-wider uppercase">Audience</div>
    </motion.div>
  );
};

export default CreatorNetworkViz;

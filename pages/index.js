import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import Script from 'next/script';
import '../styles/page.css';
import Image from 'next/image';

export default function Home() {

  // Handle Light Node button click
  const handleLightNodeClick = () => {
    window.open(process.env.NEXT_PUBLIC_DASHBOARD_URL, '_blank');
  };

  const [currentIndex, setCurrentIndex] = useState(0);
  const items = [0, 1, 2]; // 3 items for carousel

  const handlePrevClick = () => {
    setCurrentIndex((prevIndex) => (prevIndex === 0 ? items.length - 1 : prevIndex - 1));
  };

  const handleNextClick = () => {
    setCurrentIndex((prevIndex) => (prevIndex === items.length - 1 ? 0 : prevIndex + 1));
  };

  useEffect(() => {
    // Particle Animation for Hero Section
    function initParticleAnimation() {
      const canvas = document.getElementById('particleCanvas');
      if (!canvas || !window.THREE) {
        console.warn('No particleCanvas or Three.js not loaded');
        return;
      }
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const particleCount = 150;
      const particlesGeometry = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);
      const sizes = new Float32Array(particleCount);

      for (let i = 0; i < particleCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 6 + Math.random() * 2;
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
        colors[i * 3] = 0.12;
        colors[i * 3 + 1] = 0.24;
        colors[i * 3 + 2] = 0.55; // Deep blue (#1E3A8A)
        sizes[i] = 0.05 + Math.random() * 0.1;
      }

      particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      particlesGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

      const particleMaterial = new THREE.PointsMaterial({
        size: 0.1,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
      });

      const particles = new THREE.Points(particlesGeometry, particleMaterial);
      scene.add(particles);

      camera.position.z = 12;

      const animate = () => {
        requestAnimationFrame(animate);
        particles.rotation.y += 0.001;
        for (let i = 0; i < particleCount; i++) {
          positions[i * 3 + 1] += Math.sin(Date.now() * 0.0005 + i) * 0.005;
          positions[i * 3] += Math.cos(Date.now() * 0.0005 + i) * 0.005;
        }
        particlesGeometry.attributes.position.needsUpdate = true;
        renderer.render(scene, camera);
      };
      animate();

      const resizeCanvas = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', resizeCanvas);

      // Parallax effect
      const hero = document.querySelector('.hero');
      window.addEventListener('scroll', () => {
        const scrollY = window.scrollY;
        const heroRect = hero.getBoundingClientRect();
        if (heroRect.top < window.innerHeight && heroRect.bottom > 0) {
          particles.position.y = scrollY * 0.02;
        }
      });

      return () => {
        window.removeEventListener('resize', resizeCanvas);
        renderer.dispose();
      };
    }

    // Header scroll effect
    window.addEventListener('scroll', () => {
      const header = document.querySelector('header');
      if (window.scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    });

    // Existing Animations (Preserved)
    function initLinesAnimation() {
      const canvas = document.getElementById('linesCanvas');
      if (!canvas) {
        console.warn('No linesCanvas found');
        return;
      }
      const ctx = canvas.getContext('2d');
      let lines = [];
      let particles = [];
      let animationFrameId;

      function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);

      class Line {
        constructor() {
          this.startX = Math.random() * canvas.width;
          this.startY = Math.random() * canvas.height;
          this.endX = canvas.width / 2;
          this.endY = canvas.height / 2;
          this.branches = [];
          for (let i = 0; i < Math.floor(Math.random() * 2) + 2; i++) {
            const angle = Math.random() * Math.PI * 2;
            const length = Math.random() * 150 + 100;
            this.branches.push({
              endX: this.endX + Math.cos(angle) * length,
              endY: this.endY + Math.sin(angle) * length,
            });
          }
        }

        draw() {
          ctx.strokeStyle = '#3B82F6';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(this.startX, this.startY);
          ctx.lineTo(this.endX, this.endY);
          ctx.stroke();
          this.branches.forEach((branch) => {
            ctx.beginPath();
            ctx.moveTo(this.endX, this.endY);
            ctx.lineTo(branch.endX, branch.endY);
            ctx.stroke();
          });
          ctx.fillStyle = 'rgba(10, 10, 10, 0.7)';
          ctx.fillRect(this.endX - 15, this.endY - 15, 30, 30);
          ctx.fillStyle = '#E6E6E6';
          ctx.font = '10px Roboto Mono';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('S.AI', this.endX, this.endY);
        }
      }

      class Particle {
        constructor(line) {
          this.line = line;
          this.t = 0;
          this.speed = Math.random() * 0.005 + 0.005;
          this.phase = 'toCenter';
          this.branchIndex = Math.floor(Math.random() * line.branches.length);
        }

        update() {
          if (this.phase === 'toCenter') {
            this.t += this.speed;
            if (this.t >= 1) {
              this.t = 0;
              this.phase = 'branching';
            }
          } else {
            this.t += this.speed;
            if (this.t >= 1) {
              this.t = 0;
              this.phase = 'toCenter';
              this.line = lines[Math.floor(Math.random() * lines.length)];
              this.branchIndex = Math.floor(Math.random() * this.line.branches.length);
            }
          }
        }

        draw() {
          ctx.fillStyle = '#3B82F6';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#3B82F6';
          ctx.beginPath();
          let x, y;
          if (this.phase === 'toCenter') {
            x = this.line.startX + (this.line.endX - this.line.startX) * this.t;
            y = this.line.startY + (this.line.endY - this.line.startY) * this.t;
          } else {
            const branch = this.line.branches[this.branchIndex];
            x = this.line.endX + (branch.endX - this.line.endX) * this.t;
            y = this.line.endY + (branch.endY - this.line.endY) * this.t;
          }
          ctx.arc(x, y, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      function initLinesAndParticles() {
        lines = [];
        particles = [];
        const lineCount = 15;
        for (let i = 0; i < lineCount; i++) {
          lines.push(new Line());
        }
        const particleCount = 50;
        for (let i = 0; i < particleCount; i++) {
          particles.push(new Particle(lines[Math.floor(Math.random() * lines.length)]));
        }
      }
      initLinesAndParticles();

      function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        lines.forEach((line) => line.draw());
        particles.forEach((particle) => {
          particle.update();
          particle.draw();
        });
        animationFrameId = requestAnimationFrame(animate);
      }
      animate();

      const statsSection = document.querySelector('.stats');
      if (statsSection) {
        const observer = new IntersectionObserver(
          (entries) => {
            if (entries[0].isIntersecting) {
              if (!animationFrameId) animate();
            } else {
              cancelAnimationFrame(animationFrameId);
              animationFrameId = null;
            }
          },
          { threshold: 0.1 }
        );
        observer.observe(statsSection);
      }

      window.addEventListener('resize', initLinesAndParticles);
    }

    function initTextAnimation() {
      const items = document.querySelectorAll('.text-list li');
      if (items.length === 0) {
        console.warn('No elements found for .text-list li');
        return;
      }

      let lastScrollTop = window.pageYOffset || document.documentElement.scrollTop;
      let visibleIndex = 0;
      let isInView = false;
      let scrollTimeout = null;
      let lastScrollPosition = lastScrollTop;

      function showNextItem() {
        if (visibleIndex < items.length && isInView) {
          setTimeout(() => {
            if (items[visibleIndex]) {
              items[visibleIndex].classList.add('visible');
              visibleIndex++;
            }
          }, 100);
        }
      }

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            isInView = entry.isIntersecting;
            if (isInView) {
              items.forEach((item) => item.classList.remove('visible'));
              visibleIndex = 0;
              lastScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
              window.addEventListener('scroll', handleScroll);
            } else {
              window.removeEventListener('scroll', handleScroll);
              clearTimeout(scrollTimeout);
            }
          });
        },
        { threshold: 0.5 }
      );

      const textList = document.querySelector('.text-list');
      if (textList) {
        observer.observe(textList);
      }

      function handleScroll() {
        const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          lastScrollPosition = currentScrollTop;
        }, 250);
        if (currentScrollTop > lastScrollTop && currentScrollTop - lastScrollPosition > 60) {
          if (visibleIndex < items.length && isInView) {
            showNextItem();
            lastScrollPosition = currentScrollTop;
          }
        }
        lastScrollTop = currentScrollTop <= 0 ? 0 : currentScrollTop;
      }

      items.forEach((item) => item.classList.remove('visible'));
    }

    function initZKAnimation() {
      const zkSection = document.querySelector('.zk-section');
      if (!zkSection) {
        console.warn('No .zk-section element found in the DOM');
        return;
      }

      let isInView = false;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            isInView = entry.isIntersecting;
            if (isInView) {
              zkSection.classList.add('visible');
            } else {
              zkSection.classList.remove('visible');
            }
          });
        },
        { threshold: 0.3 }
      );

      observer.observe(zkSection);
    }

    function initRoadmapAnimation() {
      const items = document.querySelectorAll('.roadmap-list li');
      if (items.length === 0) {
        console.warn('No elements found for .roadmap-list li');
        return;
      }

      let lastScrollTop = window.pageYOffset || document.documentElement.scrollTop;
      let visibleIndex = 0;
      let isInView = false;
      let scrollTimeout = null;
      let lastScrollPosition = lastScrollTop;

      function showNextItem() {
        if (visibleIndex < items.length && isInView) {
          setTimeout(() => {
            if (items[visibleIndex]) {
              items[visibleIndex].classList.add('visible');
              visibleIndex++;
            }
          }, 50);
        }
      }

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            isInView = entry.isIntersecting;
            if (isInView) {
              items.forEach((item) => item.classList.remove('visible'));
              visibleIndex = 0;
              lastScrollPosition = window.pageYOffset || document.documentElement.scrollTop;
              window.addEventListener('scroll', handleScroll);
            } else {
              window.removeEventListener('scroll', handleScroll);
              clearTimeout(scrollTimeout);
            }
          });
        },
        { threshold: 0.3 }
      );

      const roadmapList = document.querySelector('.roadmap-list');
      if (roadmapList) {
        observer.observe(roadmapList);
      }

      function handleScroll() {
        const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          lastScrollPosition = currentScrollTop;
        }, 250);
        if (currentScrollTop > lastScrollTop && currentScrollTop - lastScrollPosition > 60) {
          if (visibleIndex < items.length && isInView) {
            showNextItem();
            lastScrollPosition = currentScrollTop;
          }
        }
        lastScrollTop = currentScrollTop <= 0 ? 0 : currentScrollTop;
      }

      items.forEach((item) => item.classList.remove('visible'));
    }

    function initStepsAnimation() {
      const stepsList = document.querySelector('.steps-list');
      if (!stepsList) {
        console.warn('No .steps-list element found in the DOM');
        return;
      }

      const items = document.querySelectorAll('.step-item');
      let isInView = false;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            isInView = entry.isIntersecting;
            if (isInView) {
              items.forEach((item, index) => {
                setTimeout(() => {
                  item.classList.add('visible');
                }, index * 200); // Stagger animation by 200ms
              });
            } else {
              items.forEach((item) => item.classList.remove('visible'));
            }
          });
        },
        { threshold: 0.2 }
      );

      observer.observe(stepsList);
    }

    function initDeviceAndStatsAnimation() {
      const deviceContent = document.querySelector('.device-content');
      const statsP = document.querySelector('.stats p');

      if (!deviceContent || !statsP) {
        console.warn('No .device-content or .stats p found');
        return;
      }

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
            } else {
              entry.target.classList.remove('visible');
            }
          });
        },
        { threshold: 0.2 }
      );

      observer.observe(deviceContent);
      observer.observe(statsP);
    }

    // Typewriter Effect
    const textElement = document.getElementById('typewriter-text');
    if (textElement) {
      const text = 'Reshape the data economy through a decentralized network that leverages idle bandwidth, integrates Artificial Intelligence (AI), and employs ZK-Compression on the Solana blockchain...';
      let index = 0;
      function typeEffect() {
        if (index < text.length) {
          textElement.innerHTML += text.charAt(index);
          index++;
          setTimeout(typeEffect, 70);
        } else {
          setTimeout(() => {
            textElement.innerHTML = '';
            index = 0;
            typeEffect();
          }, 2000);
        }
      }
      typeEffect();
    }

    // Three.js Sphere
    const canvas = document.getElementById('sphereCanvas');
    if (canvas) {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });

      function resizeCanvas() {
        const container = canvas.parentElement;
        const size = Math.min(container.clientWidth, container.clientHeight) * 0.9;
        renderer.setSize(size, size);
        camera.aspect = 1;
        camera.updateProjectionMatrix();
      }
      resizeCanvas();

      const radius = 30;
      const segments = 16;
      const sphereGeometry = new THREE.SphereGeometry(radius, segments, segments);
      const sphereMaterial = new THREE.MeshBasicMaterial({
        color: 0x3B82F6,
        wireframe: true,
        opacity: 0.5,
        transparent: true,
      });
      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      scene.add(sphere);

      const pointsGeometry = new THREE.BufferGeometry();
      const pointsMaterial = new THREE.PointsMaterial({
        color: 0x3B82F6,
        size: 0.6,
        opacity: 0.5,
        transparent: true,
      });

      const points = [];
      for (let i = 0; i < 50; i++) {
        const phi = Math.random() * Math.PI * 2;
        const theta = Math.acos(2 * Math.random() - 1);
        const x = radius * Math.sin(theta) * Math.cos(phi);
        const y = radius * Math.sin(theta) * Math.sin(phi);
        const z = radius * Math.cos(theta);
        points.push(x, y, z);
      }

      pointsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const pointsMesh = new THREE.Points(pointsGeometry, pointsMaterial);
      scene.add(pointsMesh);

      camera.position.set(30, 10, 40);
      camera.lookAt(0, 0, 0);
      function animate() {
        requestAnimationFrame(animate);
        sphere.rotation.y += 0.005;
        pointsMesh.rotation.y += 0.005;
        pointsMaterial.opacity = 0.5 + Math.sin(Date.now() * 0.002) * 0.5;
        renderer.render(scene, camera);
      }

      animate();

      window.addEventListener('resize', resizeCanvas);
    }

    // Initialize Animations
    const cleanupParticle = initParticleAnimation();
    initLinesAnimation();
    initTextAnimation();
    initZKAnimation();
    initRoadmapAnimation();
    initStepsAnimation();
    initDeviceAndStatsAnimation();

    return () => {
      cleanupParticle();
    };
  }, []);

  return (
    <div>
      <Head>
        <title>S.AI</title>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <header>
  <div className="logo">
    <image src="/logo.png" alt="S.AI Logo" width={100} height={50} loading="lazy" />
  </div>
  <div className="menu">
    <div className="social-icons">
      <a href="https://x.com/sailabs_" target="_blank" rel="noopener noreferrer">
        <image src="/twitter.png" alt="Twitter" className="social-icon" loading="lazy" />
      </a>
      <a href="https://discord.com" target="_blank" rel="noopener noreferrer">
        <image src="/discord.png" alt="Discord" className="social-icon" loading="lazy" />
      </a>
      <a href="https://telegram.org" target="_blank" rel="noopener noreferrer">
        <image src="/telegram.png" alt="Telegram" className="social-icon" loading="lazy" />
      </a>
    </div>
    <a href={process.env.NEXT_PUBLIC_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
  Dashboard
</a>
  </div>
</header>
      <div className="hero">
        <canvas id="particleCanvas" className="particle-canvas"></canvas>
        <h1>DECENTRALIZED DATA AND BLOCKCHAIN</h1>
        <p>
          Processed by AI and securely stored, leveraging ZK-Compression and the power of the Solana
          Blockchain
        </p>
        <div className="button-container">
          <button className="button" onClick={handleLightNodeClick}>
            <span>START NOW</span>
          </button>
          <a href="/docs">Docs</a>
        </div>
      </div>
      <div className="network-container">
        <div className="text-container">
          <h1 id="typewriter-text"></h1>
        </div>
        <div className="sphere-container">
          <canvas id="sphereCanvas"></canvas>
        </div>
      </div>
      <div className="logos">
        <img src="/logo1.png" alt="Logo 1" loading="lazy" />
        <img src="/logo2.png" alt="Logo 2" loading="lazy" />
        <img src="/logo3.png" alt="Logo 3" loading="lazy" />
        <img src="/logo4.png" alt="Logo 4" loading="lazy" />
        <img src="/logo5.png" alt="Logo 5" loading="lazy" />
        <img src="/logo6.png" alt="Logo 6" loading="lazy" />
        <img src="/logo7.png" alt="Logo 7" loading="lazy" />
      </div>
      <div className="device-content">
        <p>
          In the digital era, data fuels innovation, yet centralized platforms dominate data
          collection and analysis, eroding privacy and restricting equitable access. S.AI emerges to
          reshape the data economy through a decentralized network that leverages idle bandwidth,
          integrates Artificial Intelligence (AI), and employs ZK-Compression on the Solana
          blockchain.
        </p>
        <img src="/device.png" alt="Device" loading="lazy" />
      </div>
      <section className="carousel-section">
        <div className="carousel-container">
          <button className="carousel-button prev" onClick={handlePrevClick}>
            &lt;
          </button>
          <div className="carousel-items">
            {items.map((item, index) => (
              <div
                key={index}
                className={`carousel-item ${index === currentIndex ? 'active' : ''}`}
              >
                <div className="carousel-content">
                  <img
                    src={`/carousel-image-${index + 1}.png`}
                    alt={`Carousel Image ${index + 1}`}
                    className="carousel-image"
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>
          <button className="carousel-button next" onClick={handleNextClick}>
            &gt;
          </button>
        </div>
      </section>
      <div className="stats">
        <img src="/logo.png" alt="Logo-stats" loading="lazy" />
        <p>
          S.AI enables users to share unused bandwidth to collect real-time data <br /> processed by AI
          to deliver value-added insights, and stored efficiently <br /> using ZK-Compression.
        </p>
        <canvas className="lines-canvas" id="linesCanvas"></canvas>
        <ul className="text-list">
          <li>Data Collection: Users share idle bandwidth through the S.AI app or browser extension.</li>
          <li>AI Processing: Raw data is analyzed by AI to generate value-added products.</li>
          <li>Storage and Verification: ZK-Compression compresses data, and ZK-Proofs verify its accuracy without revealing sensitive details.</li>
          <li>Reward Distribution: Based on their bandwidth contributions, recorded transparently on Solana.</li>
        </ul>
      </div>
      <section className="zk-section">
        <h1>LEVERAGE ZK-COMPRESSION</h1>
        <div className="powered-by">
          <span>Powered by</span>
          <div className="logo-container">
            <img src="/zk-logo.png" alt="ZK Logo" loading="lazy" />
          </div>
        </div>
      </section>
      <span className="step-list-title">
        <h3>START YOUR JOURNEY</h3>
      </span>
      <div className="steps-list">
        <div className="step-item">
          <h2>Step 1: Access</h2>
          <button className="button" onClick={handleLightNodeClick}>
            <span>Dashboard</span>
          </button>
        </div>
        <div className="step-item">
          <h2>Step 2: Login with <br /> Solana Wallet</h2>
          <div className="step-logo">
            <img src="/phantom.png" alt="Phantom Logo" loading="lazy" />
            <img src="/backpack.png" alt="Backpack Logo" loading="lazy" />
          </div>
        </div>
        <div className="step-item">
          <h2>Step 3: Earn Points</h2>
          <p>Start Node and start earning points.</p>
        </div>
      </div>
      <section className="roadmap">
        <h2>ROADMAP</h2>
        <ul className="roadmap-list">
          <li>
            <span className="time completed">Q2 2025</span>
            <div className="content">
              <p>Launch simulation on Solana devnet.</p>
              <p>Deploy desktop application for node operation.</p>
              <p>Collect sample data and integrate basic AI functionality.</p>
            </div>
          </li>
          <li>
            <span className="time">Q3 2025</span>
            <div className="content">
              <p>Test ZK-compression on Solana testnet.</p>
              <p>Optimize AI models for DeFi and market analysis applications.</p>
            </div>
          </li>
          <li>
            <span className="time">Q4 2025</span>
            <div className="content">
              <p>Deploy testnet with full features (nodes, AI, ZK-rollup).</p>
              <p>Mobile node launch.</p>
            </div>
          </li>
          <li>
            <span className="time">Q1 2026</span>
            <div className="content">
              <p>Token Generation Event (TGE).</p>
              <p>Enable third-party DApps to leverage S.AI datasets.</p>
              <p>Integrate oracles for on-chain AI results.</p>
            </div>
          </li>
          <li>
            <span className="time">Q2 2026</span>
            <div className="content">
              <p>
                Develop Layer-1 Solana Virtual Machine (SVM), enhancing scalability and AI integration.
              </p>
            </div>
          </li>
          <li>
            <span className="time">Q3 2026</span>
            <div className="content">
              <p>
                Expand ecosystem to support AI applications in healthcare, education, e-commerce, and
                beyond.
              </p>
            </div>
          </li>
        </ul>
      </section>
      <footer>
        <div className="footer-container">
          <div className="footer-logo">
            <img src="/logo.png" alt="S.AI Logo" loading="lazy" />
            <p className="copyright">© S.AI, 2025. All rights reserved.</p>
          </div>
          <div className="social-icons">
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer">
              <img src="/twitter.png" alt="Twitter" className="social-icon" loading="lazy" />
            </a>
            <a href="https://discord.com" target="_blank" rel="noopener noreferrer">
              <img src="/discord.png" alt="Discord" className="social-icon" loading="lazy" />
            </a>
            <a href="https://telegram.org" target="_blank" rel="noopener noreferrer">
              <img src="/telegram.png" alt="Telegram" className="social-icon" loading="lazy" />
            </a>
          </div>
          <div className="footer-links-container">
            <div className="footer-links-left">
              <a href="#about">About</a>
              <a href="#blog">Blog</a>
              <a href="#support">Support</a>
            </div>
            <div className="footer-links-right">
              <a href="#whitepaper">Whitepaper</a>
              <a href="#docs">Docs</a>
              <a href="#faq">FAQ</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
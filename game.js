/**
 * Snow Wall Smasher - 스노우 월 스매셔
 * A physics-based throwing game using Matter.js
 */

// Matter.js module aliases
const { Engine, Render, Runner, Bodies, Body, Composite, Events, Vector, Mouse, Query } = Matter;

// Costume Configuration
const COSTUMES = {
    snowball: {
        name: '눈덩이',
        emoji: '⚪',
        normal: { emoji: '⚪', color: '#ffffff' },
        heavy: { emoji: '🔵', color: '#42a5f5' },
        paint: { emoji: '🔴', color: '#ec407a' }
    },
    shuriken: {
        name: '표창',
        emoji: '⭐',
        normal: { emoji: '⭐', color: '#ffd700' },
        heavy: { emoji: '🌟', color: '#ff8c00' },
        paint: { emoji: '💫', color: '#ff69b4' }
    },
    hamburger: {
        name: '햄버거',
        emoji: '🍔',
        normal: { emoji: '🍔', color: '#d2691e' },
        heavy: { emoji: '🍖', color: '#8b4513' },
        paint: { emoji: '🍟', color: '#ffd700' }
    },
    taco: {
        name: '타코',
        emoji: '🌮',
        normal: { emoji: '🌮', color: '#f4a460' },
        heavy: { emoji: '🌯', color: '#daa520' },
        paint: { emoji: '🫔', color: '#ff6347' }
    },
    fish: {
        name: '생선',
        emoji: '🐟',
        normal: { emoji: '🐟', color: '#4169e1' },
        heavy: { emoji: '🐋', color: '#191970' },
        paint: { emoji: '🦑', color: '#ff69b4' }
    },
    rocket: {
        name: '로켓',
        emoji: '🚀',
        normal: { emoji: '🚀', color: '#ff4500' },
        heavy: { emoji: '🛸', color: '#9400d3' },
        paint: { emoji: '✨', color: '#ff1493' }
    }
};

// Game Configuration
const CONFIG = {
    // Physics
    gravity: 0.8,
    throwMultiplier: 0.15,
    curveThreshold: 30, // minimum curve movement to trigger curve ball
    curveStrength: 0.003,
    maxThrowSpeed: 25,

    // Projectile properties (physics - same for all costumes)
    projectile: {
        normal: { radius: 15, mass: 1, restitution: 0.3 },
        heavy: { radius: 20, mass: 3, restitution: 0.1 },
        paint: { radius: 18, mass: 0.8, restitution: 0.2, splashRadius: 80 }
    },

    // Wall properties
    wall: {
        brickWidth: 35,
        brickHeight: 22,
        gap: 2,
        materials: {
            ice: { friction: 0.02, restitution: 0.6, health: 1, color: '#81d4fa' },
            wood: { friction: 0.4, restitution: 0.3, health: 2, color: '#a1887f' },
            brick: { friction: 0.6, restitution: 0.2, health: 3, color: '#ef5350' }
        }
    },

    // Wind
    wind: {
        maxStrength: 0.002,
        changeInterval: 10000 // ms
    },

    // Game
    initialSnowballs: 20,
    heavySnowballs: 3,
    paintSnowballs: 2,
    pointsPerBrick: 10,
    pointsForTarget: 500,
    targetRevealThreshold: 0.3 // 30% of bricks destroyed to reveal target area
};

// Game State
class GameState {
    constructor() {
        this.costume = 'snowball'; // Default costume
        this.reset();
    }

    reset() {
        this.score = 0;
        this.level = 1;
        this.projectilesRemaining = CONFIG.initialSnowballs;
        this.heavyProjectiles = CONFIG.heavySnowballs;
        this.paintProjectiles = CONFIG.paintSnowballs;
        this.selectedProjectileType = 'normal';
        this.wind = { x: 0, y: 0 };
        this.targetFound = false;
        this.targetDestroyed = false;
        this.bricksDestroyed = 0;
        this.totalBricks = 0;
        this.isGameOver = false;
        this.isDragging = false;
        this.dragStart = null;
        this.dragHistory = [];
        this.activeProjectiles = [];
        this.wallBricks = [];
        this.targetBricks = [];
        this.paintSplatters = [];
    }
}

// Main Game Class
class SnowWallSmasher {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.state = new GameState();
        this.engine = null;
        this.render = null;
        this.runner = null;
        this.gameStarted = false;

        this.setupStartScreen();
    }

    setupStartScreen() {
        // Costume selection
        document.querySelectorAll('.costume-option').forEach(option => {
            option.addEventListener('click', () => {
                document.querySelectorAll('.costume-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                this.state.costume = option.dataset.costume;
            });
        });

        // Start button
        document.getElementById('start-btn').addEventListener('click', () => {
            this.startGame();
        });
    }

    startGame() {
        // Hide start screen, show game
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('game-container').classList.remove('hidden');

        this.gameStarted = true;
        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupPhysics();
        this.setupEventListeners();
        this.createLevel();
        this.updateUI();
        this.startWindCycle();
        this.showLevelInfo();

        // Debug: Log canvas and wall info
        console.log('Canvas size:', this.canvas.width, 'x', this.canvas.height);
        console.log('Wall bricks created:', this.state.wallBricks.length);
    }

    setupCanvas() {
        // Set canvas size to fill window
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Handle resize
        window.addEventListener('resize', () => {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
            if (this.render) {
                this.render.canvas.width = this.canvas.width;
                this.render.canvas.height = this.canvas.height;
                this.render.options.width = this.canvas.width;
                this.render.options.height = this.canvas.height;
            }
        });
    }

    setupPhysics() {
        // Create engine
        this.engine = Engine.create({
            gravity: { x: 0, y: CONFIG.gravity }
        });

        // Create renderer - use pixelRatio 1 to avoid coordinate scaling issues
        this.render = Render.create({
            canvas: this.canvas,
            engine: this.engine,
            options: {
                width: this.canvas.width,
                height: this.canvas.height,
                wireframes: false,
                background: '#1a1a2e',
                pixelRatio: 1
            }
        });

        // Create ground and walls (invisible boundaries)
        const ground = Bodies.rectangle(
            this.canvas.width / 2,
            this.canvas.height + 50,
            this.canvas.width * 2,
            100,
            { isStatic: true, render: { visible: false } }
        );

        const leftWall = Bodies.rectangle(
            -50,
            this.canvas.height / 2,
            100,
            this.canvas.height * 2,
            { isStatic: true, render: { visible: false } }
        );

        const rightWall = Bodies.rectangle(
            this.canvas.width + 50,
            this.canvas.height / 2,
            100,
            this.canvas.height * 2,
            { isStatic: true, render: { visible: false } }
        );

        const ceiling = Bodies.rectangle(
            this.canvas.width / 2,
            -50,
            this.canvas.width * 2,
            100,
            { isStatic: true, render: { visible: false } }
        );

        Composite.add(this.engine.world, [ground, leftWall, rightWall, ceiling]);

        // Set up collision events
        Events.on(this.engine, 'collisionStart', (event) => this.handleCollision(event));

        // Custom render for additional effects
        Events.on(this.render, 'afterRender', () => this.renderCustomEffects());

        // Start the engine and renderer
        this.runner = Runner.create();
        Runner.run(this.runner, this.engine);
        Render.run(this.render);

        // Game loop for wind and snowball cleanup
        this.gameLoop();
    }

    setupEventListeners() {
        // Mouse/Touch events for throwing
        this.canvas.addEventListener('mousedown', (e) => this.onDragStart(e));
        this.canvas.addEventListener('mousemove', (e) => this.onDragMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onDragEnd(e));
        this.canvas.addEventListener('mouseleave', (e) => this.onDragEnd(e));

        // Touch events
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.onDragStart(e.touches[0]);
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            this.onDragMove(e.touches[0]);
        });
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.onDragEnd(e.changedTouches[0]);
        });

        // Snowball type selection
        document.querySelectorAll('.snowball-type').forEach(el => {
            el.addEventListener('click', () => this.selectProjectileType(el.dataset.type));
        });

        // Restart button
        document.getElementById('restart-btn').addEventListener('click', () => this.restart());
    }

    getCanvasCoords(event) {
        const rect = this.canvas.getBoundingClientRect();
        // Direct mapping - canvas size matches display size with pixelRatio 1
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    }

    onDragStart(event) {
        if (this.state.isGameOver) return;

        const coords = this.getCanvasCoords(event);

        // Only allow throwing from bottom half of screen
        if (coords.y < this.canvas.height * 0.5) return;

        this.state.isDragging = true;
        this.state.dragStart = coords;
        this.state.dragHistory = [{ ...coords, time: Date.now() }];
    }

    onDragMove(event) {
        if (!this.state.isDragging) return;

        const coords = this.getCanvasCoords(event);
        this.state.dragHistory.push({ ...coords, time: Date.now() });

        // Keep only recent history for curve calculation
        if (this.state.dragHistory.length > 20) {
            this.state.dragHistory.shift();
        }
    }

    onDragEnd(event) {
        if (!this.state.isDragging) return;

        const coords = this.getCanvasCoords(event);
        this.state.isDragging = false;

        // Calculate throw velocity
        const dragEnd = coords;
        const dragStart = this.state.dragStart;

        // Must drag upward to throw
        if (dragEnd.y >= dragStart.y) {
            this.state.dragStart = null;
            this.state.dragHistory = [];
            return;
        }

        // Calculate velocity based on drag distance and time
        const dx = dragEnd.x - dragStart.x;
        const dy = dragEnd.y - dragStart.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < 30) {
            this.state.dragStart = null;
            this.state.dragHistory = [];
            return;
        }

        // Calculate curve from drag history
        const curve = this.calculateCurve();

        // Create and throw projectile
        this.throwProjectile(dragStart, { x: dx, y: dy }, curve);

        this.state.dragStart = null;
        this.state.dragHistory = [];
    }

    calculateCurve() {
        const history = this.state.dragHistory;
        if (history.length < 5) return 0;

        let totalCurve = 0;
        for (let i = 2; i < history.length; i++) {
            const prev = history[i - 2];
            const mid = history[i - 1];
            const curr = history[i];

            // Calculate cross product to determine curve direction
            const v1 = { x: mid.x - prev.x, y: mid.y - prev.y };
            const v2 = { x: curr.x - mid.x, y: curr.y - mid.y };
            const cross = v1.x * v2.y - v1.y * v2.x;

            totalCurve += cross;
        }

        // Normalize curve
        const normalizedCurve = totalCurve / (history.length * 100);
        return Math.max(-1, Math.min(1, normalizedCurve));
    }

    throwProjectile(startPos, velocity, curve) {
        const type = this.state.selectedProjectileType;
        const costume = COSTUMES[this.state.costume];

        console.log('Throwing projectile:', type, 'costume:', this.state.costume);
        console.log('Start position:', startPos);
        console.log('Velocity:', velocity);

        // Check if we have enough projectiles
        if (type === 'heavy' && this.state.heavyProjectiles <= 0) return;
        if (type === 'paint' && this.state.paintProjectiles <= 0) return;
        if (type === 'normal' && this.state.projectilesRemaining <= 0) return;

        const physics = CONFIG.projectile[type];
        const visual = costume[type];

        // Calculate throw velocity
        let vx = velocity.x * CONFIG.throwMultiplier;
        let vy = velocity.y * CONFIG.throwMultiplier;

        // Clamp velocity
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > CONFIG.maxThrowSpeed) {
            const scale = CONFIG.maxThrowSpeed / speed;
            vx *= scale;
            vy *= scale;
        }

        // Create projectile body
        const projectile = Bodies.circle(startPos.x, startPos.y, physics.radius, {
            mass: physics.mass,
            restitution: physics.restitution,
            friction: 0.1,
            frictionAir: 0.01,
            render: {
                fillStyle: visual.color,
                strokeStyle: this.darkenColor(visual.color, 30),
                lineWidth: 2,
                visible: false // We'll draw emoji instead
            },
            label: 'projectile',
            projectileType: type,
            emoji: visual.emoji,
            curve: curve,
            initialScale: 1
        });

        // Apply initial velocity
        Body.setVelocity(projectile, { x: vx, y: vy });

        // Add to world
        Composite.add(this.engine.world, projectile);
        this.state.activeProjectiles.push(projectile);

        console.log('Projectile created at:', projectile.position);
        console.log('Projectile velocity:', vx, vy);
        console.log('Active projectiles:', this.state.activeProjectiles.length);

        // Decrement projectile count
        if (type === 'normal') {
            this.state.projectilesRemaining--;
        } else if (type === 'heavy') {
            this.state.heavyProjectiles--;
        } else if (type === 'paint') {
            this.state.paintProjectiles--;
        }

        // Show curve indicator
        if (Math.abs(curve) > 0.3) {
            this.showCurveIndicator();
        }

        this.updateUI();
    }

    showCurveIndicator() {
        const indicator = document.getElementById('curve-indicator');
        indicator.classList.remove('hidden');
        setTimeout(() => indicator.classList.add('hidden'), 500);
    }

    handleCollision(event) {
        const pairs = event.pairs;

        pairs.forEach(pair => {
            const { bodyA, bodyB } = pair;

            // Check if projectile hit a brick
            const projectile = bodyA.label === 'projectile' ? bodyA :
                            (bodyB.label === 'projectile' ? bodyB : null);
            const brick = bodyA.label === 'brick' ? bodyA :
                         (bodyB.label === 'brick' ? bodyB : null);

            if (projectile && brick) {
                this.onProjectileHitBrick(projectile, brick, pair);
            }
        });
    }

    onProjectileHitBrick(projectile, brick, collision) {
        const speed = Math.sqrt(
            projectile.velocity.x ** 2 + projectile.velocity.y ** 2
        );

        // Calculate damage based on speed and projectile type
        let damage = speed * 0.5;
        if (projectile.projectileType === 'heavy') {
            damage *= 2;
        }

        // Apply damage to brick
        brick.health = (brick.health || brick.maxHealth) - damage;

        // Create impact effect
        this.createImpactEffect(collision.collision.supports[0] || brick.position, projectile.projectileType);

        // Paint projectile reveals hidden target
        if (projectile.projectileType === 'paint') {
            const costume = COSTUMES[this.state.costume];
            this.createPaintSplatter(brick.position, costume.paint.color);
            this.checkTargetReveal(brick);
        }

        // Check if brick should be destroyed
        if (brick.health <= 0) {
            this.destroyBrick(brick);
        } else {
            // Update brick appearance based on damage
            this.updateBrickAppearance(brick);
        }

        // Remove projectile after impact (with slight delay for effect)
        setTimeout(() => {
            Composite.remove(this.engine.world, projectile);
            this.state.activeProjectiles = this.state.activeProjectiles.filter(p => p !== projectile);
        }, 50);
    }

    destroyBrick(brick) {
        // Add score
        this.state.score += CONFIG.pointsPerBrick;
        this.state.bricksDestroyed++;

        // Check if it's a target brick
        if (brick.isTarget) {
            this.onTargetBrickDestroyed(brick);
        }

        // Create destruction particles
        this.createDestructionParticles(brick);

        // Remove brick
        Composite.remove(this.engine.world, brick);
        this.state.wallBricks = this.state.wallBricks.filter(b => b !== brick);

        // Check win/lose conditions
        this.checkGameState();
        this.updateUI();
    }

    onTargetBrickDestroyed(brick) {
        this.state.targetBricks = this.state.targetBricks.filter(b => b !== brick);

        if (!this.state.targetFound) {
            this.state.targetFound = true;
            this.showTargetFoundMessage();
        }

        // Check if all target bricks are destroyed
        if (this.state.targetBricks.length === 0) {
            this.state.targetDestroyed = true;
            this.state.score += CONFIG.pointsForTarget;
        }
    }

    showTargetFoundMessage() {
        const msg = document.createElement('div');
        msg.className = 'target-found';
        msg.textContent = '타겟 발견!';
        document.getElementById('game-container').appendChild(msg);
        setTimeout(() => msg.remove(), 1000);
    }

    updateBrickAppearance(brick) {
        const healthPercent = brick.health / brick.maxHealth;
        const baseColor = brick.baseColor || brick.render.fillStyle;

        // Darken brick based on damage
        const darkenAmount = (1 - healthPercent) * 50;
        brick.render.fillStyle = this.darkenColor(baseColor, darkenAmount);

        // Add cracks (visual only - using opacity)
        brick.render.opacity = 0.7 + healthPercent * 0.3;
    }

    createImpactEffect(position, projectileType) {
        const effect = document.createElement('div');
        effect.className = 'impact-effect';
        effect.style.left = `${position.x - 30}px`;
        effect.style.top = `${position.y - 30}px`;

        if (projectileType === 'heavy') {
            effect.style.width = '100px';
            effect.style.height = '100px';
            effect.style.left = `${position.x - 50}px`;
            effect.style.top = `${position.y - 50}px`;
        }

        document.getElementById('game-container').appendChild(effect);
        setTimeout(() => effect.remove(), 300);
    }

    createPaintSplatter(position, color) {
        this.state.paintSplatters.push({
            x: position.x,
            y: position.y,
            radius: CONFIG.projectile.paint.splashRadius,
            color: color,
            alpha: 0.6
        });
    }

    checkTargetReveal(hitBrick) {
        // Check if paint revealed a target brick
        this.state.wallBricks.forEach(brick => {
            if (brick.isTarget && !brick.revealed) {
                const dx = brick.position.x - hitBrick.position.x;
                const dy = brick.position.y - hitBrick.position.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance < CONFIG.projectile.paint.splashRadius) {
                    brick.revealed = true;
                    brick.render.fillStyle = '#ffd700';
                    brick.render.strokeStyle = '#ff8c00';
                    brick.render.lineWidth = 3;
                }
            }
        });
    }

    createDestructionParticles(brick) {
        const numParticles = 5;
        for (let i = 0; i < numParticles; i++) {
            const particle = Bodies.circle(
                brick.position.x + (Math.random() - 0.5) * 20,
                brick.position.y + (Math.random() - 0.5) * 20,
                5 + Math.random() * 5,
                {
                    mass: 0.1,
                    restitution: 0.3,
                    friction: 0.8,
                    render: {
                        fillStyle: brick.render.fillStyle,
                        opacity: 0.8
                    },
                    label: 'particle'
                }
            );

            Body.setVelocity(particle, {
                x: (Math.random() - 0.5) * 10,
                y: -Math.random() * 5
            });

            Composite.add(this.engine.world, particle);

            // Remove particle after a while
            setTimeout(() => {
                Composite.remove(this.engine.world, particle);
            }, 2000);
        }
    }

    createLevel() {
        // Clear existing bricks
        this.state.wallBricks.forEach(brick => {
            Composite.remove(this.engine.world, brick);
        });
        this.state.wallBricks = [];
        this.state.targetBricks = [];
        this.state.paintSplatters = [];

        // Determine wall material based on level
        const materials = Object.keys(CONFIG.wall.materials);
        const materialKey = materials[(this.state.level - 1) % materials.length];
        const material = CONFIG.wall.materials[materialKey];

        // Calculate wall dimensions - account for UI (top: ~80px, bottom: ~150px)
        const topMargin = 100; // Space for top UI
        const bottomMargin = 180; // Space for bottom UI and throw area
        const availableHeight = this.canvas.height - topMargin - bottomMargin;

        const brickW = CONFIG.wall.brickWidth;
        const brickH = CONFIG.wall.brickHeight;
        const gap = CONFIG.wall.gap;

        // Calculate columns and rows first
        const maxWallWidth = Math.min(350, this.canvas.width * 0.85);
        const maxWallHeight = Math.min(250, availableHeight * 0.6);

        const cols = Math.floor(maxWallWidth / (brickW + gap));
        const rows = Math.floor(maxWallHeight / (brickH + gap));

        // Calculate actual wall dimensions based on brick count
        const actualWallWidth = cols * (brickW + gap) - gap;
        const actualWallHeight = rows * (brickH + gap) - gap;

        // Center the wall properly
        const startX = (this.canvas.width - actualWallWidth) / 2;
        const startY = topMargin + 20; // Position wall below top UI

        console.log('Wall dimensions:', actualWallWidth, 'x', actualWallHeight);
        console.log('Wall position:', startX, startY);
        console.log('Cols:', cols, 'Rows:', rows);

        // Randomly select target area (2x2 to 3x3 bricks)
        const targetWidth = 2 + Math.floor(Math.random() * 2);
        const targetHeight = 2 + Math.floor(Math.random() * 2);
        const targetStartCol = Math.floor(Math.random() * (cols - targetWidth));
        const targetStartRow = Math.floor(Math.random() * (rows - targetHeight));

        // Create bricks
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const x = startX + col * (brickW + gap) + brickW / 2;
                const y = startY + row * (brickH + gap) + brickH / 2;

                // Check if this brick is part of the target
                const isTarget = col >= targetStartCol && col < targetStartCol + targetWidth &&
                                row >= targetStartRow && row < targetStartRow + targetHeight;

                const brick = Bodies.rectangle(x, y, brickW, brickH, {
                    isStatic: true,
                    friction: material.friction,
                    restitution: material.restitution,
                    render: {
                        fillStyle: material.color,
                        strokeStyle: this.darkenColor(material.color, 20),
                        lineWidth: 1
                    },
                    label: 'brick',
                    maxHealth: material.health * (1 + this.state.level * 0.2),
                    health: material.health * (1 + this.state.level * 0.2),
                    baseColor: material.color,
                    isTarget: isTarget,
                    revealed: false
                });

                Composite.add(this.engine.world, brick);
                this.state.wallBricks.push(brick);

                if (isTarget) {
                    this.state.targetBricks.push(brick);
                }
            }
        }

        this.state.totalBricks = this.state.wallBricks.length;
        this.state.bricksDestroyed = 0;
    }

    startWindCycle() {
        this.updateWind();
        setInterval(() => this.updateWind(), CONFIG.wind.changeInterval);
    }

    updateWind() {
        // Random wind direction and strength
        const angle = Math.random() * Math.PI * 2;
        const strength = Math.random() * CONFIG.wind.maxStrength;

        this.state.wind = {
            x: Math.cos(angle) * strength,
            y: Math.sin(angle) * strength * 0.3 // Less vertical wind
        };

        this.updateWindUI();
    }

    updateWindUI() {
        const windArrow = document.getElementById('wind-arrow');
        const windStrength = document.getElementById('wind-strength');

        // Calculate wind angle for arrow rotation
        const angle = Math.atan2(this.state.wind.y, this.state.wind.x) * (180 / Math.PI);
        windArrow.style.transform = `rotate(${angle}deg)`;

        // Display wind strength
        const strength = Math.sqrt(this.state.wind.x ** 2 + this.state.wind.y ** 2);
        const strengthPercent = Math.round((strength / CONFIG.wind.maxStrength) * 100);
        windStrength.textContent = strengthPercent + '%';
    }

    gameLoop() {
        // Apply wind and curve to active projectiles
        this.state.activeProjectiles.forEach(projectile => {
            // Apply wind
            Body.applyForce(projectile, projectile.position, this.state.wind);

            // Apply curve (Magnus effect)
            if (projectile.curve && Math.abs(projectile.curve) > 0.1) {
                const curveForce = {
                    x: projectile.curve * CONFIG.curveStrength * projectile.velocity.y,
                    y: -projectile.curve * CONFIG.curveStrength * projectile.velocity.x * 0.5
                };
                Body.applyForce(projectile, projectile.position, curveForce);
            }

            // Scale projectile based on Y position (perspective)
            const yRatio = projectile.position.y / this.canvas.height;
            const scale = 0.5 + yRatio * 0.5;
            if (Math.abs(scale - projectile.initialScale) > 0.05) {
                Body.scale(projectile, scale / projectile.initialScale, scale / projectile.initialScale);
                projectile.initialScale = scale;
            }

            // Remove if out of bounds
            if (projectile.position.y > this.canvas.height + 100 ||
                projectile.position.x < -100 ||
                projectile.position.x > this.canvas.width + 100) {
                Composite.remove(this.engine.world, projectile);
                this.state.activeProjectiles = this.state.activeProjectiles.filter(p => p !== projectile);
                this.checkGameState();
            }
        });

        requestAnimationFrame(() => this.gameLoop());
    }

    renderCustomEffects() {
        const ctx = this.render.context;

        // Draw trajectory preview while dragging
        if (this.state.isDragging && this.state.dragStart) {
            const current = this.state.dragHistory[this.state.dragHistory.length - 1];
            if (current) {
                this.drawTrajectoryPreview(ctx, this.state.dragStart, current);
            }
        }

        // Draw paint splatters
        this.state.paintSplatters.forEach(splatter => {
            ctx.save();
            ctx.globalAlpha = splatter.alpha;
            ctx.fillStyle = splatter.color;
            ctx.beginPath();
            ctx.arc(splatter.x, splatter.y, splatter.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });

        // Draw projectiles with emoji
        this.state.activeProjectiles.forEach(projectile => {
            this.drawProjectile(ctx, projectile);
        });
    }

    drawTrajectoryPreview(ctx, start, current) {
        const dx = current.x - start.x;
        const dy = current.y - start.y;

        // Only show if dragging upward
        if (dy >= 0) return;

        // Calculate predicted trajectory
        let vx = dx * CONFIG.throwMultiplier;
        let vy = dy * CONFIG.throwMultiplier;

        // Clamp velocity
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > CONFIG.maxThrowSpeed) {
            const scale = CONFIG.maxThrowSpeed / speed;
            vx *= scale;
            vy *= scale;
        }

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 10]);
        ctx.beginPath();

        let x = start.x;
        let y = start.y;
        let velX = vx;
        let velY = vy;

        ctx.moveTo(x, y);

        for (let t = 0; t < 30; t++) {
            velY += CONFIG.gravity * 0.016 * 60; // Simulate gravity
            velX += this.state.wind.x * 100;
            x += velX;
            y += velY;

            if (y < 0 || y > this.canvas.height) break;

            ctx.lineTo(x, y);
        }

        ctx.stroke();
        ctx.restore();

        // Draw power indicator
        const power = Math.min(100, Math.round(speed / CONFIG.maxThrowSpeed * 100));
        ctx.save();
        ctx.fillStyle = 'white';
        ctx.font = '16px Arial';
        ctx.fillText(`파워: ${power}%`, start.x + 20, start.y);
        ctx.restore();
    }

    drawProjectile(ctx, projectile) {
        const emoji = projectile.emoji;
        const radius = projectile.circleRadius || 15;
        const fontSize = radius * 2;

        ctx.save();
        ctx.font = `${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, projectile.position.x, projectile.position.y);

        // Draw trail
        const speed = Math.sqrt(projectile.velocity.x ** 2 + projectile.velocity.y ** 2);
        if (speed > 2) {
            ctx.globalAlpha = 0.3;
            for (let i = 1; i <= 3; i++) {
                const trailX = projectile.position.x - projectile.velocity.x * i * 0.3;
                const trailY = projectile.position.y - projectile.velocity.y * i * 0.3;
                const trailSize = fontSize * (1 - i * 0.2);
                ctx.font = `${trailSize}px Arial`;
                ctx.fillText(emoji, trailX, trailY);
            }
        }
        ctx.restore();
    }

    selectProjectileType(type) {
        // Check availability
        if (type === 'heavy' && this.state.heavyProjectiles <= 0) return;
        if (type === 'paint' && this.state.paintProjectiles <= 0) return;

        this.state.selectedProjectileType = type;

        // Update UI
        document.querySelectorAll('.snowball-type').forEach(el => {
            el.classList.toggle('selected', el.dataset.type === type);
        });
    }

    updateUI() {
        document.getElementById('score').textContent = this.state.score;
        document.getElementById('remaining').textContent = this.state.projectilesRemaining;
        document.getElementById('heavy-count').textContent = this.state.heavyProjectiles;
        document.getElementById('paint-count').textContent = this.state.paintProjectiles;

        // Update button states
        document.querySelectorAll('.snowball-type').forEach(el => {
            const type = el.dataset.type;
            if (type === 'heavy') {
                el.classList.toggle('disabled', this.state.heavyProjectiles <= 0);
            } else if (type === 'paint') {
                el.classList.toggle('disabled', this.state.paintProjectiles <= 0);
            }
        });
    }

    checkGameState() {
        // Win condition: all target bricks destroyed
        if (this.state.targetDestroyed) {
            this.victory();
            return;
        }

        // Lose condition: no projectiles and no active projectiles
        const totalProjectiles = this.state.projectilesRemaining +
                              this.state.heavyProjectiles +
                              this.state.paintProjectiles;

        if (totalProjectiles <= 0 && this.state.activeProjectiles.length === 0) {
            this.defeat();
        }
    }

    victory() {
        this.state.isGameOver = true;

        const modal = document.getElementById('game-modal');
        const content = modal.querySelector('.modal-content');
        const title = document.getElementById('modal-title');
        const message = document.getElementById('modal-message');
        const finalScore = document.getElementById('final-score-value');

        content.classList.remove('defeat');
        content.classList.add('victory');
        title.textContent = '승리!';
        message.textContent = '타겟을 파괴했습니다!';
        finalScore.textContent = this.state.score;

        modal.classList.remove('hidden');
    }

    defeat() {
        this.state.isGameOver = true;

        const modal = document.getElementById('game-modal');
        const content = modal.querySelector('.modal-content');
        const title = document.getElementById('modal-title');
        const message = document.getElementById('modal-message');
        const finalScore = document.getElementById('final-score-value');

        content.classList.remove('victory');
        content.classList.add('defeat');
        title.textContent = '게임 오버';
        message.textContent = this.state.targetFound ?
            '타겟을 찾았지만 파괴하지 못했습니다!' :
            '타겟을 찾지 못했습니다!';
        finalScore.textContent = this.state.score;

        modal.classList.remove('hidden');
    }

    showLevelInfo() {
        const levelInfo = document.getElementById('level-info');
        const levelNumber = document.getElementById('level-number');
        const levelDesc = document.getElementById('level-desc');

        const materials = ['얼음', '나무', '벽돌'];
        const materialIndex = (this.state.level - 1) % materials.length;

        levelNumber.textContent = this.state.level;
        levelDesc.textContent = `${materials[materialIndex]} 벽을 부수세요!`;

        levelInfo.classList.remove('hidden');
        setTimeout(() => levelInfo.classList.add('hidden'), 2000);
    }

    restart() {
        // Hide modal
        document.getElementById('game-modal').classList.add('hidden');

        // Clear world
        Composite.clear(this.engine.world, false);

        // Reset state
        this.state.reset();

        // Recreate boundaries
        const ground = Bodies.rectangle(
            this.canvas.width / 2,
            this.canvas.height + 50,
            this.canvas.width * 2,
            100,
            { isStatic: true, render: { visible: false } }
        );

        const leftWall = Bodies.rectangle(
            -50,
            this.canvas.height / 2,
            100,
            this.canvas.height * 2,
            { isStatic: true, render: { visible: false } }
        );

        const rightWall = Bodies.rectangle(
            this.canvas.width + 50,
            this.canvas.height / 2,
            100,
            this.canvas.height * 2,
            { isStatic: true, render: { visible: false } }
        );

        const ceiling = Bodies.rectangle(
            this.canvas.width / 2,
            -50,
            this.canvas.width * 2,
            100,
            { isStatic: true, render: { visible: false } }
        );

        Composite.add(this.engine.world, [ground, leftWall, rightWall, ceiling]);

        // Recreate level
        this.createLevel();
        this.updateUI();
        this.showLevelInfo();

        // Reset projectile selection
        this.selectProjectileType('normal');
    }

    // Utility function to darken a color
    darkenColor(color, percent) {
        // Handle hex colors
        if (color.startsWith('#')) {
            let r = parseInt(color.slice(1, 3), 16);
            let g = parseInt(color.slice(3, 5), 16);
            let b = parseInt(color.slice(5, 7), 16);

            r = Math.max(0, Math.floor(r * (1 - percent / 100)));
            g = Math.max(0, Math.floor(g * (1 - percent / 100)));
            b = Math.max(0, Math.floor(b * (1 - percent / 100)));

            return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        }
        return color;
    }
}

// Initialize game when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.game = new SnowWallSmasher();
});

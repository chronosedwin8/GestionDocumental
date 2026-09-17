document.addEventListener('DOMContentLoaded', () => {
    // Menu mobile toggle
    const mobileMenuBtn = document.getElementById('mobile-menu');
    const navLinks = document.querySelector('.nav-links');

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // Cerrar menú al hacer clic en un enlace (mobile)
    const links = document.querySelectorAll('.nav-links a');
    links.forEach(link => {
        link.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                navLinks.classList.remove('active');
            }
        });
    });

    // Accordion FAQ logic
    const accordions = document.querySelectorAll('.accordion-header');
    
    accordions.forEach(accordion => {
        accordion.addEventListener('click', function() {
            // Cerrar otros acordeones si se desea (opcional, aquí permitimos múltiples abiertos)
            /*
            accordions.forEach(acc => {
                if (acc !== this) {
                    acc.classList.remove('active');
                    acc.nextElementSibling.style.maxHeight = null;
                }
            });
            */
            
            this.classList.toggle('active');
            
            const content = this.nextElementSibling;
            if (content.style.maxHeight) {
                content.style.maxHeight = null;
                this.querySelector('.icon').textContent = '+';
            } else {
                content.style.maxHeight = content.scrollHeight + "px";
                this.querySelector('.icon').textContent = '−';
            }
        });
    });

    // Añadir clase scrolled al navbar al bajar
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.style.background = 'rgba(10, 10, 10, 0.9)';
            navbar.style.boxShadow = '0 4px 30px rgba(0, 0, 0, 0.5)';
        } else {
            navbar.style.background = 'rgba(24, 24, 27, 0.7)';
            navbar.style.boxShadow = 'none';
        }
    });

    // Gallery Logic
    const track = document.getElementById('gallery-track');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const indicatorsContainer = document.getElementById('gallery-indicators');
    
    if (track) {
        const slides = Array.from(track.children);
        let currentIndex = 0;

        // Create indicators
        slides.forEach((_, index) => {
            const dot = document.createElement('div');
            dot.classList.add('indicator');
            if (index === 0) dot.classList.add('active');
            dot.addEventListener('click', () => goToSlide(index));
            indicatorsContainer.appendChild(dot);
        });

        const indicators = Array.from(indicatorsContainer.children);

        const updateGallery = () => {
            track.style.transform = `translateX(-${currentIndex * 100}%)`;
            indicators.forEach((dot, index) => {
                dot.classList.toggle('active', index === currentIndex);
            });
        };

        const goToSlide = (index) => {
            currentIndex = index;
            updateGallery();
        };

        const nextSlide = () => {
            currentIndex = (currentIndex + 1) % slides.length;
            updateGallery();
        };

        const prevSlide = () => {
            currentIndex = (currentIndex - 1 + slides.length) % slides.length;
            updateGallery();
        };

        if (nextBtn) nextBtn.addEventListener('click', nextSlide);
        if (prevBtn) prevBtn.addEventListener('click', prevSlide);

        // Auto slide
        setInterval(nextSlide, 5000);
    }
});

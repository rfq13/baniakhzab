import { useState, useEffect, useRef } from "react";
import {
  Search,
  Users,
  History,
  UserPlus,
  Menu,
  X,
  Mail,
  Phone,
  ChevronDown,
  Heart,
  MessageCircle,
  Star,
  Moon,
  BookOpen,
  Scroll
} from "lucide-react";

// Islamic SVG Components
const IslamicStar = ({ className = "", size = 24 }) => (
  <svg viewBox="0 0 100 100" className={className} width={size} height={size} fill="currentColor">
    <polygon points="50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35" />
  </svg>
);

const CrescentMoon = ({ className = "", size = 24 }) => (
  <svg viewBox="0 0 100 100" className={className} width={size} height={size} fill="currentColor">
    <path d="M50 5C25.1 5 5 25.1 5 50s20.1 45 45 45c8.3 0 16.1-2.3 22.8-6.2C59.5 82.5 50 69.7 50 55c0-14.7 9.5-27.5 22.8-33.8C66.1 7.3 58.3 5 50 5z" />
  </svg>
);

const IslamicPattern = ({ className = "" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="0.5">
    <circle cx="50" cy="50" r="45" />
    <circle cx="50" cy="50" r="35" />
    <circle cx="50" cy="50" r="25" />
    <circle cx="50" cy="50" r="15" />
    {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
      <line key={i} x1="50" y1="5" x2="50" y2="95" transform={`rotate(${angle} 50 50)`} />
    ))}
    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => (
      <circle key={`small-${i}`} cx="50" cy="10" r="3" transform={`rotate(${angle} 50 50)`} fill="currentColor" stroke="none" />
    ))}
  </svg>
);

const ArabicBismillah = ({ className = "" }) => (
  <div className={`font-serif text-2xl md:text-3xl ${className}`} style={{ fontFamily: "'Amiri', serif" }}>
    بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ
  </div>
);

const IslamicDivider = ({ className = "" }) => (
  <div className={`flex items-center justify-center gap-4 ${className}`}>
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/30 to-primary/50" />
    <IslamicStar className="text-primary" size={16} />
    <CrescentMoon className="text-primary" size={20} />
    <IslamicStar className="text-primary" size={16} />
    <div className="h-px flex-1 bg-gradient-to-l from-transparent via-primary/30 to-primary/50" />
  </div>
);

const MosqueSilhouette = ({ className = "" }) => (
  <svg viewBox="0 0 200 100" className={className} fill="currentColor">
    <path d="M100,5 Q120,5 120,25 L120,40 L125,40 L125,35 Q125,30 130,30 Q135,30 135,35 L135,40 L140,40 L140,100 L60,100 L60,40 L65,40 L65,35 Q65,30 70,30 Q75,30 75,35 L75,40 L80,40 L80,25 Q80,5 100,5" />
    <rect x="85" y="60" width="30" height="40" rx="15" />
    <circle cx="35" cy="70" r="25" />
    <rect x="30" y="70" width="10" height="30" />
    <circle cx="165" cy="70" r="25" />
    <rect x="160" y="70" width="10" height="30" />
  </svg>
);

// Custom hook for intersection observer animations
const useInView = (options = {}) => {
  const ref = useRef(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
      }
    }, { threshold: 0.1, ...options });

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return [ref, isInView];
};

// Animated Section Component
const AnimatedSection = ({ children, className = "", animation = "fade-in-up", delay = 0 }) => {
  const [ref, isInView] = useInView();

  return (
    <div
      ref={ref}
      className={`${className} ${isInView ? `animate-${animation}` : 'opacity-0'}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
};

export default function Landing() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [contacts, setContacts] = useState({
    whatsapp: "6281234567890", // default fallback
    email: "halo@baniakhzab.com" // default fallback
  });

  useEffect(() => {
    const fetchContacts = async () => {
      try {
        const response = await fetch('/api/v1/settings/landing');
        if (response.ok) {
          const data = await response.json();
          if (data.whatsapp || data.email) {
            setContacts(prev => ({
              whatsapp: data.whatsapp || prev.whatsapp,
              email: data.email || prev.email
            }));
          }
        }
      } catch (err) {
        console.error("Failed to fetch landing contacts:", err);
      }
    };
    fetchContacts();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const features = [
    {
      icon: BookOpen,
      title: "Pohon Silsilah Interaktif",
      description: "Jelajahi garis keturunan Anda dengan diagram yang interaktif, zoom, dan pan untuk melihat setiap cabang keluarga.",
      gradient: "from-primary/10 to-transparent"
    },
    {
      icon: Search,
      title: "Pencarian Anggota",
      description: "Temukan profil anggota keluarga dengan cepat menggunakan filter pencarian yang mendalam dan hasil yang akurat.",
      gradient: "from-heritage-bronze/10 to-transparent"
    },
    {
      icon: Scroll,
      title: "Riwayat Generasi",
      description: "Pelajari sejarah, cerita, dan arsip foto dari generasi ke generasi untuk memahami asal-usul keluarga.",
      gradient: "from-heritage-gold/10 to-transparent"
    },
    {
      icon: UserPlus,
      title: "Kolaborasi Keluarga",
      description: "Undang kerabat untuk berkolaborasi memperbarui profil, menambahkan foto, dan melengkapi data keluarga bersama.",
      gradient: "from-heritage-brown/10 to-transparent"
    }
  ];

  const steps = [
    {
      number: "1",
      title: "Hubungi Admin",
      description: "Hubungi admin melalui WhatsApp untuk mendaftarkan diri sebagai anggota keluarga.",
      active: false
    },
    {
      number: "2",
      title: "Lengkapi Data",
      description: "Lengkapi data silsilah dengan menambahkan anggota keluarga yang belum terdaftar.",
      active: true
    },
    {
      number: "3",
      title: "Jelajahi Pohon",
      description: "Nikmati visualisasi pohon keluarga yang interaktif dan mudah dipahami.",
      active: false
    }
  ];

  const navLinks = [
    { href: "#", label: "Beranda" },
    { href: "#tentang", label: "Tentang" },
    { href: "#fitur", label: "Fitur" },
    { href: "/tree", label: "Silsilah" },
    { href: "#kontak", label: "Kontak" }
  ];

  return (
    <div className="bg-background font-sans text-foreground antialiased overflow-x-hidden min-h-screen">
      {/* Islamic Geometric Pattern Background */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='80' height='80' viewBox='0 0 80 80' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' stroke='%23D97706' stroke-width='0.5'%3E%3Cpath d='M40,0 L80,40 L40,80 L0,40 Z'/%3E%3Cpath d='M40,10 L70,40 L40,70 L10,40 Z'/%3E%3Cpath d='M40,20 L60,40 L40,60 L20,40 Z'/%3E%3Ccircle cx='40' cy='40' r='8'/%3E%3Ccircle cx='40' cy='10' r='3'/%3E%3Ccircle cx='70' cy='40' r='3'/%3E%3Ccircle cx='40' cy='70' r='3'/%3E%3Ccircle cx='10' cy='40' r='3'/%3E%3C/g%3E%3C/svg%3E")`
        }} />
      </div>

      {/* ─── Header / Navbar ─── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${scrolled
          ? 'bg-background/95 backdrop-blur-xl shadow-lg shadow-primary/5 border-b border-border'
          : 'bg-transparent'
          }`}
        data-testid="header"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 lg:h-20">
            {/* Logo with Islamic Design */}
            <a href="/" className="flex items-center gap-3 group" data-testid="logo">
              <div className="relative flex items-center justify-center size-12 rounded-2xl bg-gradient-to-br from-primary to-heritage-bronze text-primary-foreground shadow-lg shadow-primary/25 group-hover:shadow-primary/40 transition-all duration-300 group-hover:scale-105 overflow-hidden">
                <div className="absolute inset-0 opacity-20">
                  <IslamicPattern className="w-full h-full text-white" />
                </div>
                <span className="relative z-10 font-serif text-2xl" style={{ fontFamily: "'Amiri', serif" }}>ب</span>
              </div>
              <div className="flex flex-col">
                <span className="font-serif font-bold text-xl text-secondary dark:text-foreground tracking-tight">Bani Akhzab</span>
                <span className="text-[10px] text-muted-foreground font-medium tracking-widest uppercase flex items-center gap-1">
                  <Star className="size-2.5 fill-primary text-primary" />
                  Silsilah Keluarga
                  <Star className="size-2.5 fill-primary text-primary" />
                </span>
              </div>
            </a>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-1" data-testid="desktop-nav">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all duration-200"
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <a
                href="/tree"
                className="hidden sm:inline-flex items-center justify-center px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary to-heritage-bronze hover:from-primary/90 hover:to-heritage-bronze/90 text-primary-foreground text-sm font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all duration-300 hover:scale-105"
                data-testid="cta-button-header"
              >
                <CrescentMoon className="size-4 mr-2" size={16} />
                Mulai Jelajahi
              </a>

              {/* Mobile Menu Toggle */}
              <button
                className="lg:hidden p-2 text-secondary dark:text-foreground hover:bg-accent rounded-lg transition-colors"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                data-testid="mobile-menu-trigger"
              >
                {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-background/95 backdrop-blur-xl border-b border-border">
            <div className="max-w-7xl mx-auto px-4 py-6">
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center justify-center size-11 rounded-xl bg-gradient-to-br from-primary to-heritage-bronze text-primary-foreground overflow-hidden">
                    <div className="absolute inset-0 opacity-20">
                      <IslamicPattern className="w-full h-full text-white" />
                    </div>
                    <span className="relative z-10 font-serif text-xl" style={{ fontFamily: "'Amiri', serif" }}>ب</span>
                  </div>
                  <span className="font-serif font-bold text-lg">Bani Akhzab</span>
                </div>
                <IslamicDivider />
                <nav className="flex flex-col gap-2">
                  {navLinks.map((link) => (
                    <a
                      key={link.label}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="px-4 py-3 text-base font-medium text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-all flex items-center gap-2"
                    >
                      <IslamicStar className="size-3 text-primary" size={12} />
                      {link.label}
                    </a>
                  ))}
                </nav>
                <a
                  href="/tree"
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full flex items-center justify-center px-5 py-3 rounded-lg bg-gradient-to-r from-primary to-heritage-bronze text-primary-foreground font-semibold shadow-lg transition-all"
                >
                  <CrescentMoon className="size-4 mr-2" size={16} />
                  Mulai Jelajahi
                </a>
              </div>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* ─── Hero Section ─── */}
        <section className="relative min-h-screen flex items-center pt-20 pb-16 lg:pt-0 lg:pb-0 overflow-hidden" data-testid="hero-section">
          {/* Islamic Decorative Elements */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {/* Floating Crescent Moons and Stars */}
            <div className="absolute top-32 left-[5%] opacity-10 animate-float">
              <CrescentMoon className="size-24 lg:size-32 text-primary" size={128} />
            </div>
            <div className="absolute top-48 left-[15%] opacity-10 animate-float" style={{ animationDelay: '1s' }}>
              <IslamicStar className="size-12 text-heritage-gold" size={48} />
            </div>
            <div className="absolute bottom-32 right-[5%] opacity-10 animate-float-delayed">
              <CrescentMoon className="size-32 lg:size-40 text-heritage-bronze" size={160} />
            </div>
            <div className="absolute bottom-48 right-[15%] opacity-10 animate-float" style={{ animationDelay: '2s' }}>
              <IslamicStar className="size-16 text-primary" size={64} />
            </div>
            <div className="absolute top-1/3 right-[8%] opacity-5 animate-float-delayed" style={{ animationDelay: '3s' }}>
              <IslamicPattern className="size-40 text-heritage-gold" />
            </div>
            <div className="absolute bottom-1/3 left-[8%] opacity-5 animate-float" style={{ animationDelay: '4s' }}>
              <IslamicPattern className="size-32 text-primary" />
            </div>

            {/* Corner Ornaments */}
            <div className="absolute top-20 right-0 w-32 h-32 opacity-10">
              <svg viewBox="0 0 100 100" className="w-full h-full text-primary" fill="currentColor">
                <path d="M100,0 L100,100 Q50,100 50,50 Q50,0 100,0" />
              </svg>
            </div>
            <div className="absolute bottom-0 left-0 w-32 h-32 opacity-10">
              <svg viewBox="0 0 100 100" className="w-full h-full text-primary" fill="currentColor">
                <path d="M0,100 L0,0 Q50,0 50,50 Q50,100 0,100" />
              </svg>
            </div>
          </div>

          {/* Gradient Overlays */}
          <div className="absolute inset-0 bg-gradient-to-br from-heritage-cream/80 via-transparent to-accent/50 dark:from-background dark:via-transparent dark:to-heritage-dark/50" />
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Hero Content */}
              <div className="text-center lg:text-left order-2 lg:order-1">
                {/* Bismillah */}
                <div className="mb-8 animate-fade-in-down">
                  <ArabicBismillah className="text-primary/80 text-center lg:text-left" />
                </div>

                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 animate-fade-in-down" style={{ animationDelay: '100ms' }}>
                  <CrescentMoon className="size-4" size={16} />
                  <span>Platform Silsilah Keluarga</span>
                  <IslamicStar className="size-3" size={12} />
                </div>

                <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold text-secondary dark:text-foreground tracking-tight leading-[1.1] mb-6 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
                  Menjaga & Menelusuri
                  <span className="block mt-2 bg-gradient-to-r from-primary via-heritage-bronze to-heritage-gold bg-clip-text text-transparent">
                    Silsilah Keluarga
                  </span>
                </h1>

                <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 mb-10 leading-relaxed animate-fade-in-up" style={{ animationDelay: '300ms' }}>
                  Platform elegan dan interaktif untuk memvisualisasikan, menjelajahi, dan melestarikan pohon keluarga Bani Akhzab untuk generasi mendatang.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
                  <a
                    href="/tree"
                    className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-base rounded-lg bg-gradient-to-r from-primary to-heritage-bronze hover:from-primary/90 hover:to-heritage-bronze/90 text-primary-foreground font-semibold shadow-xl shadow-primary/30 hover:shadow-primary/50 transition-all duration-300 hover:scale-105 animate-pulse-glow"
                    data-testid="hero-cta-primary"
                  >
                    <CrescentMoon className="size-5 mr-2" size={20} />
                    Lihat Silsilah
                  </a>
                  <a
                    href={`https://wa.me/${contacts.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-base rounded-lg border-2 border-border bg-background/60 text-secondary dark:text-foreground font-semibold hover:bg-accent transition-all duration-300 hover:scale-105"
                    data-testid="hero-cta-secondary"
                  >
                    <MessageCircle className="size-5 mr-2" />
                    Daftar Sekarang
                  </a>
                </div>

                {/* Stats with Islamic styling */}
                <div className="mt-12 pt-8 border-t border-border animate-fade-in-up" style={{ animationDelay: '500ms' }}>
                  <IslamicDivider className="mb-6" />
                  <div className="grid grid-cols-3 gap-6">
                    <div className="text-center lg:text-left">
                      <div className="text-3xl lg:text-4xl font-bold text-primary font-serif">500+</div>
                      <div className="text-sm text-muted-foreground mt-1">Anggota</div>
                    </div>
                    <div className="text-center lg:text-left">
                      <div className="text-3xl lg:text-4xl font-bold text-heritage-bronze font-serif">7</div>
                      <div className="text-sm text-muted-foreground mt-1">Generasi</div>
                    </div>
                    <div className="text-center lg:text-left">
                      <div className="text-3xl lg:text-4xl font-bold text-heritage-gold font-serif">50+</div>
                      <div className="text-sm text-muted-foreground mt-1">Tahun</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Hero Image with Islamic Frame */}
              <div className="order-1 lg:order-2 relative animate-fade-in-right" style={{ animationDelay: '300ms' }}>
                <div className="relative aspect-square max-w-md mx-auto lg:max-w-none">
                  {/* Islamic decorative rings */}
                  <div className="absolute inset-0 rounded-full border-2 border-dashed border-primary/20 animate-spin" style={{ animationDuration: '30s' }} />
                  <div className="absolute inset-4 rounded-full border-2 border-dashed border-heritage-bronze/20 animate-spin" style={{ animationDuration: '25s', animationDirection: 'reverse' }} />

                  {/* Decorative stars around the image */}
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                    <IslamicStar className="size-6 text-primary animate-bounce-subtle" size={24} />
                  </div>
                  <div className="absolute top-1/2 -right-2 -translate-y-1/2">
                    <IslamicStar className="size-5 text-heritage-gold animate-bounce-subtle" size={20} style={{ animationDelay: '0.5s' }} />
                  </div>
                  <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                    <IslamicStar className="size-6 text-heritage-bronze animate-bounce-subtle" size={24} style={{ animationDelay: '1s' }} />
                  </div>
                  <div className="absolute top-1/2 -left-2 -translate-y-1/2">
                    <IslamicStar className="size-5 text-primary animate-bounce-subtle" size={20} style={{ animationDelay: '1.5s' }} />
                  </div>

                  {/* Main image container with Islamic arch shape */}
                  <div className="absolute inset-8 overflow-hidden shadow-2xl shadow-primary/20 border-4 border-background" style={{ borderRadius: '50% 50% 5% 5%' }}>
                    <div
                      className="absolute inset-0 bg-cover bg-center scale-110 hover:scale-100 transition-transform duration-700"
                      style={{
                        backgroundImage: "url('https://images.unsplash.com/photo-1767617774446-5bb3ce40824d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NTYxODh8MHwxfHNlYXJjaHwxfHxtdXNsaW0lMjBmYW1pbHklMjBnYXRoZXJpbmd8ZW58MHx8fHwxNzcyNzk4MDc3fDA&ixlib=rb-4.1.0&q=85')",
                        filter: 'sepia(10%)'
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-secondary/70 via-transparent to-primary/10" />

                    {/* Floating badge */}
                    <div className="absolute bottom-6 left-6 right-6 bg-background/90 backdrop-blur-xl rounded-2xl p-4 border border-border shadow-lg">
                      <div className="flex items-center gap-3">
                        <div className="size-12 rounded-xl bg-gradient-to-br from-primary to-heritage-bronze flex items-center justify-center text-primary-foreground relative overflow-hidden">
                          <div className="absolute inset-0 opacity-30">
                            <IslamicPattern className="w-full h-full text-white" />
                          </div>
                          <CrescentMoon className="size-6 relative z-10" size={24} />
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">Pohon Keluarga</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <IslamicStar className="size-2.5 text-primary" size={10} />
                            Interaktif & Modern
                            <IslamicStar className="size-2.5 text-primary" size={10} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Scroll indicator */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce-subtle hidden lg:flex flex-col items-center gap-2 text-muted-foreground">
            <span className="text-xs font-medium">Scroll</span>
            <ChevronDown className="size-5" />
          </div>
        </section>

        {/* Islamic Divider */}
        <div className="relative py-8 overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center opacity-5">
            <MosqueSilhouette className="w-full max-w-4xl text-primary" />
          </div>
          <IslamicDivider className="max-w-4xl mx-auto px-8" />
        </div>

        {/* ─── About Section ─── */}
        <section id="tentang" className="py-20 lg:py-32 bg-card relative overflow-hidden" data-testid="about-section">
          <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none" />

          {/* Corner Islamic Ornaments */}
          <div className="absolute top-10 right-10 opacity-10">
            <IslamicPattern className="size-32 text-primary" />
          </div>
          <div className="absolute bottom-10 left-10 opacity-10">
            <IslamicPattern className="size-24 text-heritage-bronze" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
              {/* Image */}
              <AnimatedSection className="order-2 lg:order-1 relative" animation="fade-in-left">
                <div className="relative">
                  {/* Background decorations */}
                  <div className="absolute -inset-4 bg-gradient-to-br from-primary/10 to-heritage-bronze/10 rounded-3xl transform rotate-3 scale-105" />
                  <div className="absolute -inset-4 border-2 border-primary/10 rounded-3xl transform -rotate-2 scale-105" />

                  {/* Main image with Islamic arch */}
                  <div className="relative overflow-hidden shadow-2xl aspect-[4/3] lg:aspect-square border-4 border-background" style={{ borderRadius: '20% 20% 5% 5%' }}>
                    <div
                      className="absolute inset-0 bg-cover bg-center transition-transform duration-700 hover:scale-105"
                      style={{
                        backgroundImage: "url('https://images.unsplash.com/photo-1609220136736-443140cffec6?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80')",
                        filter: 'sepia(15%)'
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-secondary/70 via-secondary/20 to-transparent" />
                  </div>

                  {/* Floating card */}
                  <div className="absolute -bottom-6 -right-6 bg-background rounded-2xl p-5 shadow-xl border border-border max-w-[200px]">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center relative overflow-hidden">
                        <div className="absolute inset-0 opacity-30">
                          <IslamicPattern className="w-full h-full text-primary" />
                        </div>
                        <Heart className="size-5 text-primary relative z-10" />
                      </div>
                      <div className="text-2xl font-bold text-foreground font-serif">100%</div>
                    </div>
                    <div className="text-sm text-muted-foreground">Dedikasi untuk keluarga</div>
                  </div>
                </div>
              </AnimatedSection>

              {/* Content */}
              <div className="order-1 lg:order-2">
                <AnimatedSection animation="fade-in-up">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                    <Users className="size-4" />
                    <span>Tentang Kami</span>
                  </div>
                </AnimatedSection>

                <AnimatedSection animation="fade-in-up" delay={100}>
                  <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-secondary dark:text-foreground mb-6 leading-tight">
                    Membangun Jembatan
                    <span className="block text-primary">Antar Generasi</span>
                  </h2>
                </AnimatedSection>

                <AnimatedSection animation="fade-in-up" delay={200}>
                  <p className="text-lg text-muted-foreground mb-10 leading-relaxed">
                    Kami percaya bahwa setiap keluarga memiliki cerita berharga yang layak untuk dicatat, diwariskan, dan dibagikan dengan penuh kehangatan. Platform ini hadir untuk melestarikan warisan keluarga Bani Akhzab.
                  </p>
                </AnimatedSection>

                <div className="space-y-6">
                  {[
                    { icon: BookOpen, title: "Visualisasi Interaktif", desc: "Pohon keluarga yang dinamis dan mudah dinavigasi, memberikan gambaran jelas tentang akar dan ranting silsilah." },
                    { icon: Search, title: "Pencarian Cepat", desc: "Temukan kerabat dengan mudah menggunakan fitur pencarian canggih berdasarkan nama, lokasi, atau generasi." },
                    { icon: Users, title: "Analisis Hubungan", desc: "Lihat koneksi dan benang merah antar anggota keluarga secara detail dan penuh makna." }
                  ].map((item, index) => (
                    <AnimatedSection key={item.title} animation="fade-in-up" delay={300 + (index * 100)}>
                      <div className="flex gap-4 group">
                        <div className="flex-shrink-0 size-14 rounded-2xl bg-gradient-to-br from-primary/10 to-heritage-bronze/10 flex items-center justify-center text-primary group-hover:from-primary group-hover:to-heritage-bronze group-hover:text-primary-foreground transition-all duration-300 shadow-lg shadow-primary/10 relative overflow-hidden">
                          <div className="absolute inset-0 opacity-20 group-hover:opacity-30">
                            <IslamicPattern className="w-full h-full" />
                          </div>
                          <item.icon className="size-6 relative z-10" />
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-secondary dark:text-foreground mb-2">{item.title}</h3>
                          <p className="text-muted-foreground leading-relaxed">{item.desc}</p>
                        </div>
                      </div>
                    </AnimatedSection>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Islamic Divider */}
        <IslamicDivider className="max-w-4xl mx-auto px-8 py-8" />

        {/* ─── Features Section ─── */}
        <section id="fitur" className="py-20 lg:py-32 relative overflow-hidden" data-testid="features-section">
          {/* Background decoration */}
          <div className="absolute right-0 top-1/4 opacity-5 pointer-events-none">
            <CrescentMoon className="size-96 text-primary" size={384} />
          </div>
          <div className="absolute left-0 bottom-1/4 opacity-5 pointer-events-none">
            <IslamicPattern className="size-64 text-heritage-bronze" />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <AnimatedSection className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                <IslamicStar className="size-4" size={16} />
                <span>Fitur Unggulan</span>
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-secondary dark:text-foreground mb-4">
                Fitur Utama Platform
              </h2>
              <p className="text-lg text-muted-foreground">
                Eksplorasi silsilah keluarga dengan berbagai fitur unggulan yang dirancang untuk memudahkan Anda menelusuri akar sejarah.
              </p>
              <IslamicDivider className="mt-8" />
            </AnimatedSection>

            <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
              {features.map((feature, index) => (
                <AnimatedSection key={feature.title} animation="scale-in" delay={index * 100}>
                  <div className="group relative bg-card hover:bg-card/80 backdrop-blur-sm p-8 rounded-3xl border border-border shadow-lg hover:shadow-xl transition-all duration-500 overflow-hidden">
                    {/* Hover gradient */}
                    <div className={`absolute inset-0 bg-gradient-to-br ${feature.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                    {/* Islamic corner ornament */}
                    <div className="absolute top-4 right-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <IslamicStar className="size-8 text-primary" size={32} />
                    </div>

                    <div className="relative z-10">
                      <div className="size-16 rounded-2xl bg-gradient-to-br from-primary/10 to-heritage-bronze/10 text-primary flex items-center justify-center mb-6 shadow-lg shadow-primary/10 group-hover:from-primary group-hover:to-heritage-bronze group-hover:text-primary-foreground transition-all duration-300 group-hover:scale-110 relative overflow-hidden">
                        <div className="absolute inset-0 opacity-20">
                          <IslamicPattern className="w-full h-full" />
                        </div>
                        <feature.icon className="size-8 relative z-10" />
                      </div>
                      <h3 className="text-xl font-bold text-secondary dark:text-foreground mb-3">{feature.title}</h3>
                      <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
                    </div>
                  </div>
                </AnimatedSection>
              ))}
            </div>
          </div>
        </section>

        {/* Islamic Divider */}
        <IslamicDivider className="max-w-4xl mx-auto px-8 py-8" />

        {/* ─── How It Works Section ─── */}
        <section id="silsilah" className="py-20 lg:py-32 bg-gradient-to-b from-heritage-cream to-background dark:from-heritage-dark/30 dark:to-background relative" data-testid="how-it-works-section">
          {/* Background Islamic Pattern */}
          <div className="absolute left-10 top-1/2 opacity-5 pointer-events-none transform -translate-y-1/2">
            <IslamicPattern className="size-72 text-primary" />
          </div>
          <div className="absolute right-10 top-1/3 opacity-5 pointer-events-none">
            <CrescentMoon className="size-48 text-heritage-bronze" size={192} />
          </div>

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <AnimatedSection className="text-center max-w-3xl mx-auto mb-16">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-4">
                <History className="size-4" />
                <span>Panduan</span>
              </div>
              <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-secondary dark:text-foreground mb-4">
                Cara Bergabung
              </h2>
              <p className="text-lg text-muted-foreground">
                Memulai silsilah keluarga Anda sangat mudah. Ikuti langkah-langkah sederhana untuk menanam benih sejarah Anda.
              </p>
              <IslamicDivider className="mt-8" />
            </AnimatedSection>

            <div className="relative max-w-4xl mx-auto">
              {/* Connection line */}
              <div className="absolute top-1/2 left-0 w-full h-1 bg-gradient-to-r from-primary/20 via-primary to-primary/20 -translate-y-1/2 hidden md:block rounded-full" />

              <div className="grid md:grid-cols-3 gap-8 lg:gap-12 relative">
                {steps.map((step, index) => (
                  <AnimatedSection key={step.number} animation="fade-in-up" delay={index * 150}>
                    <div className="flex flex-col items-center text-center group">
                      <div className={`relative size-24 rounded-full flex items-center justify-center text-3xl font-bold mb-6 border-4 border-background shadow-xl transition-all duration-300 group-hover:scale-110 overflow-hidden ${step.active
                        ? 'bg-gradient-to-br from-primary to-heritage-bronze text-primary-foreground shadow-primary/30 animate-pulse-glow'
                        : 'bg-card text-primary shadow-primary/10 group-hover:bg-gradient-to-br group-hover:from-primary group-hover:to-heritage-bronze group-hover:text-primary-foreground'
                        }`}>
                        <div className="absolute inset-0 opacity-20">
                          <IslamicPattern className="w-full h-full" />
                        </div>
                        <span className="absolute inset-0 rounded-full border border-primary/20 scale-125 opacity-50" />
                        <span className="relative z-10" style={{ fontFamily: "'Amiri', serif" }}>{step.number}</span>
                      </div>
                      <h3 className="text-xl font-bold text-secondary dark:text-foreground mb-3">{step.title}</h3>
                      <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                    </div>
                  </AnimatedSection>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── CTA Section ─── */}
        <section className="py-24 lg:py-32 relative overflow-hidden" data-testid="cta-section">
          <div className="absolute inset-0 bg-gradient-to-br from-secondary via-heritage-brown to-heritage-dark" />
          <div className="absolute inset-0 opacity-10 bg-cover bg-center" style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1564769625905-50e93615e769?ixlib=rb-4.0.3&auto=format&fit=crop&w=2000&q=80')",
            filter: 'sepia(50%)'
          }} />
          <div className="absolute inset-0 bg-gradient-to-t from-heritage-dark/90 to-transparent" />

          {/* Islamic Decorative Elements */}
          <div className="absolute top-10 left-10 opacity-15 animate-float">
            <CrescentMoon className="size-24 text-heritage-cream" size={96} />
          </div>
          <div className="absolute top-20 left-32 opacity-15 animate-float" style={{ animationDelay: '0.5s' }}>
            <IslamicStar className="size-8 text-heritage-gold" size={32} />
          </div>
          <div className="absolute bottom-10 right-10 opacity-15 animate-float-delayed">
            <CrescentMoon className="size-32 text-primary" size={128} />
          </div>
          <div className="absolute bottom-20 right-32 opacity-15 animate-float-delayed" style={{ animationDelay: '0.5s' }}>
            <IslamicStar className="size-10 text-heritage-cream" size={40} />
          </div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-5">
            <IslamicPattern className="size-96 text-heritage-cream" />
          </div>

          {/* Mosque Silhouette at bottom */}
          <div className="absolute bottom-0 left-0 right-0 opacity-10">
            <MosqueSilhouette className="w-full max-h-32 text-heritage-cream" />
          </div>

          <AnimatedSection className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            {/* Arabic Quote */}
            <div className="mb-6 text-heritage-cream/60 text-lg" style={{ fontFamily: "'Amiri', serif" }}>
              وَاعْتَصِمُوا بِحَبْلِ اللَّهِ جَمِيعًا وَلَا تَفَرَّقُوا
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-heritage-cream mb-6 leading-tight drop-shadow-lg">
              Mulai Jelajahi Silsilah
              <span className="block text-primary mt-2">Keluarga Anda</span>
            </h2>
            <p className="text-xl text-heritage-cream/80 mb-10 max-w-2xl mx-auto drop-shadow-md">
              Bergabunglah bersama keluarga besar Bani Akhzab dan bantu melestarikan akar sejarah kita untuk generasi yang akan datang.
            </p>
            <IslamicDivider className="max-w-md mx-auto mb-10 [&_*]:text-heritage-cream/50 [&_.h-px]:via-heritage-cream/30 [&_.h-px]:to-heritage-cream/20" />
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="/tree"
                className="inline-flex items-center justify-center px-10 py-4 text-lg rounded-xl bg-heritage-cream text-secondary font-bold hover:bg-white hover:text-primary transition-all duration-300 hover:scale-105 shadow-xl"
                data-testid="cta-button-main"
              >
                <CrescentMoon className="size-5 mr-2" size={20} />
                Lihat Pohon Keluarga
              </a>
              <a
                href={`https://wa.me/${contacts.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-10 py-4 text-lg rounded-xl border-2 border-heritage-cream/50 text-heritage-cream font-bold hover:bg-heritage-cream/10 transition-all duration-300"
              >
                <MessageCircle className="size-5 mr-2" />
                Hubungi Kami
              </a>
            </div>
          </AnimatedSection>
        </section>
      </main>

      {/* ─── Footer ─── */}
      <footer id="kontak" className="bg-heritage-dark text-heritage-cream/70 py-16 lg:py-20 border-t border-heritage-brown/30 relative overflow-hidden" data-testid="footer">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-10 left-10">
            <IslamicPattern className="size-32 text-heritage-cream" />
          </div>
          <div className="absolute bottom-10 right-10">
            <IslamicPattern className="size-24 text-heritage-cream" />
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8 mb-12">
            {/* Brand */}
            <div className="lg:col-span-1">
              <div className="flex items-center gap-3 mb-6">
                <div className="relative flex items-center justify-center size-12 rounded-2xl bg-gradient-to-br from-primary to-heritage-bronze text-primary-foreground shadow-lg shadow-primary/20 overflow-hidden">
                  <div className="absolute inset-0 opacity-20">
                    <IslamicPattern className="w-full h-full text-white" />
                  </div>
                  <span className="relative z-10 font-serif text-2xl" style={{ fontFamily: "'Amiri', serif" }}>ب</span>
                </div>
                <span className="font-serif font-bold text-xl text-heritage-cream">Bani Akhzab</span>
              </div>
              <p className="text-heritage-cream/50 mb-6 leading-relaxed">
                Platform silsilah keluarga elegan untuk mendokumentasikan, melestarikan, dan merayakan akar warisan keluarga Anda.
              </p>
              <div className="flex gap-2">
                <CrescentMoon className="size-4 text-primary" size={16} />
                <IslamicStar className="size-3 text-heritage-gold" size={12} />
                <IslamicStar className="size-3 text-heritage-gold" size={12} />
                <IslamicStar className="size-3 text-heritage-gold" size={12} />
              </div>
            </div>

            {/* Navigation */}
            <div>
              <h4 className="text-heritage-cream font-semibold mb-6 flex items-center gap-2">
                <IslamicStar className="size-3 text-primary" size={12} />
                Navigasi
              </h4>
              <ul className="space-y-4">
                {['Beranda', 'Tentang Kami', 'Fitur Platform', 'Silsilah Keluarga'].map((item) => (
                  <li key={item}>
                    <a className="hover:text-primary transition-colors duration-200 flex items-center gap-2" href="#">
                      <span className="size-1 rounded-full bg-primary/50" />
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-heritage-cream font-semibold mb-6 flex items-center gap-2">
                <IslamicStar className="size-3 text-primary" size={12} />
                Legal
              </h4>
              <ul className="space-y-4">
                {['Syarat & Ketentuan', 'Kebijakan Privasi', 'Panduan Penggunaan'].map((item) => (
                  <li key={item}>
                    <a className="hover:text-primary transition-colors duration-200 flex items-center gap-2" href="#">
                      <span className="size-1 rounded-full bg-primary/50" />
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-heritage-cream font-semibold mb-6 flex items-center gap-2">
                <IslamicStar className="size-3 text-primary" size={12} />
                Kontak
              </h4>
              <ul className="space-y-4">
                <li>
                  <a className="flex items-center gap-3 hover:text-primary transition-colors duration-200" href={`mailto:${contacts.email}`}>
                    <Mail className="size-5 text-primary" />
                    {contacts.email}
                  </a>
                </li>
                <li>
                  <a className="flex items-center gap-3 hover:text-primary transition-colors duration-200" href={`https://wa.me/${contacts.whatsapp}`} target="_blank" rel="noopener noreferrer">
                    <Phone className="size-5 text-primary" />
                    +{contacts.whatsapp.startsWith('62') ? '62 ' + contacts.whatsapp.slice(2).replace(/(\d{3})(\d{4})(\d+)/, '$1 $2 $3') : contacts.whatsapp}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <IslamicDivider className="mb-8 [&_*]:text-heritage-cream/30" />

          {/* Bottom */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-heritage-cream/40 flex items-center gap-2">
              <CrescentMoon className="size-4" size={16} />
              © 2026 Bani Akhzab. Hak Cipta Dilindungi.
            </p>
            <div className="flex items-center gap-4">
              <a aria-label="Share" className="size-10 rounded-lg bg-heritage-brown/30 flex items-center justify-center text-heritage-cream/60 hover:text-heritage-cream hover:bg-heritage-brown/50 transition-all duration-200 relative overflow-hidden" href="#">
                <div className="absolute inset-0 opacity-20">
                  <IslamicPattern className="w-full h-full text-heritage-cream" />
                </div>
                <MessageCircle className="size-5 relative z-10" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

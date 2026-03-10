import React from 'react';
import { View, Text, StyleSheet, ScrollView, Linking, TouchableOpacity, Dimensions } from 'react-native';
import { useLocation, Redirect } from 'wouter';
import { useAuth } from '../hooks/use-auth';
import { GitHub, BookOpen, Eye, Shield, Users, Award, BarChart2, Star, ArrowRight, Zap, Lock, Globe, Map } from 'react-feather';

const windowWidth = Dimensions.get('window').width;

const brand = {
  primary: '#4A90D9',
  primaryDark: '#2E6BB5',
  secondary: '#FF8C42',
  secondaryDark: '#E5732A',
  green: '#6BCB77',
  gold: '#FFD93D',
  purple: '#C084FC',
  amber: '#F5A623',
  bg: '#F8FAFF',
  text: '#1B2341',
  textLight: '#636E72',
  divider: '#DFE6E9',
  white: '#FFFFFF',
};

// ─── Inline sun icon matching the new logo ───────────────────────────────────
const SunIcon: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="wSunG" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F5A623" />
        <stop offset="100%" stopColor="#F97316" />
      </linearGradient>
    </defs>
    <circle cx="16" cy="16" r="8" fill="url(#wSunG)" />
    <circle cx="16" cy="16" r="6" fill="none" stroke="#fff" strokeWidth="0.5" opacity="0.3" />
    <circle cx="16" cy="16" r="2" fill="#fff" opacity="0.6" />
    <g stroke="#F5A623" strokeWidth="2" strokeLinecap="round" opacity="0.7">
      <line x1="16" y1="5" x2="16" y2="2" />
      <line x1="16" y1="27" x2="16" y2="30" />
      <line x1="5" y1="16" x2="2" y2="16" />
      <line x1="27" y1="16" x2="30" y2="16" />
      <line x1="8.2" y1="8.2" x2="6" y2="6" />
      <line x1="23.8" y1="8.2" x2="26" y2="6" />
      <line x1="8.2" y1="23.8" x2="6" y2="26" />
      <line x1="23.8" y1="23.8" x2="26" y2="26" />
    </g>
  </svg>
);

// ─── Hero sun graphic (larger, decorative) ───────────────────────────────────
const HeroSunGraphic: React.FC = () => (
  <svg width="320" height="320" viewBox="0 0 320 320" aria-hidden="true" focusable="false" style={{ overflow: 'visible' }}>
    <defs>
      <linearGradient id="heroSunG" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F5A623" />
        <stop offset="100%" stopColor="#F97316" />
      </linearGradient>
      <radialGradient id="heroGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#F5A623" stopOpacity="0.3" />
        <stop offset="60%" stopColor="#F5A623" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#F5A623" stopOpacity="0" />
      </radialGradient>
    </defs>
    {/* Glow */}
    <circle cx="160" cy="160" r="150" fill="url(#heroGlow)" />
    {/* Outer rays */}
    <g stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" strokeLinecap="round">
      {Array.from({ length: 16 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 16;
        const x1 = 160 + 70 * Math.cos(a);
        const y1 = 160 + 70 * Math.sin(a);
        const x2 = 160 + (i % 2 === 0 ? 120 : 95) * Math.cos(a);
        const y2 = 160 + (i % 2 === 0 ? 120 : 95) * Math.sin(a);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
    </g>
    {/* Orbit ring */}
    <circle cx="160" cy="160" r="100" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" strokeDasharray="4 6" />
    {/* Sun core */}
    <circle cx="160" cy="160" r="56" fill="url(#heroSunG)" opacity="0.9" />
    <circle cx="160" cy="160" r="42" fill="none" stroke="#fff" strokeWidth="1" opacity="0.2" />
    <circle cx="160" cy="160" r="14" fill="#fff" opacity="0.5" />
    {/* Orbital dots */}
    {[
      { angle: 0.3, r: 100, color: brand.secondary, s: 6 },
      { angle: 1.5, r: 100, color: brand.green, s: 5 },
      { angle: 2.8, r: 100, color: brand.purple, s: 6 },
      { angle: 4.2, r: 100, color: brand.gold, s: 4 },
      { angle: 5.5, r: 100, color: brand.primary, s: 5 },
    ].map((o, i) => (
      <g key={i}>
        <circle cx={160 + o.r * Math.cos(o.angle)} cy={160 + o.r * Math.sin(o.angle)} r={o.s + 3} fill={o.color} opacity="0.15" />
        <circle cx={160 + o.r * Math.cos(o.angle)} cy={160 + o.r * Math.sin(o.angle)} r={o.s} fill={o.color} opacity="0.85" />
      </g>
    ))}
  </svg>
);

const WelcomePage: React.FC = () => {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : location;

  if (user && !isLoading && (location === '/welcome' || currentPath === '/welcome')) {
    if (typeof window !== 'undefined') {
      window.location.href = '/dashboard';
    }
    return <Redirect to="/dashboard" />;
  }

  const openGitHub = () => {
    Linking.openURL('https://github.com/allonethingxyz/sunschool');
  };

  const goToAuth = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/auth';
    }
  };

  return (
    <ScrollView style={styles.scrollView}>
      <View style={styles.container}>

        {/* ── Navbar ── */}
        <View style={styles.navbar} accessibilityRole="navigation" accessibilityLabel="Main navigation">
          <View style={styles.navInner}>
            <View style={styles.logoWrap}>
              <SunIcon size={28} />
              <Text style={styles.logoText}>SUNSCHOOL</Text>
            </View>
            <View style={styles.navLinks}>
              <TouchableOpacity style={styles.navCta} onPress={goToAuth} accessibilityRole="button" accessibilityLabel="Get Started">
                <Text style={styles.navCtaText}>Get Started</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.heroInner}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroLabel}>SUNSCHOOL</Text>
              <Text style={styles.heroTitle} accessibilityRole="header">
                School {'\u2014'} anywhere{'\n'}under the sun.
              </Text>
              <Text style={styles.heroSub}>
                An AI tutor that adapts to your child. Open source, so you can see exactly how it works.
              </Text>

              <View style={styles.heroCtas}>
                <TouchableOpacity style={styles.ctaPrimary} onPress={goToAuth} accessibilityRole="button" accessibilityLabel="Get Started Free">
                  <Text style={styles.ctaPrimaryText}>Get Started Free</Text>
                  <ArrowRight size={16} color={brand.white} style={{ marginLeft: 8 }} aria-hidden="true" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.ctaOutline} onPress={openGitHub} accessibilityRole="link" accessibilityLabel="View on GitHub (opens in new window)">
                  <GitHub size={16} color={brand.white} aria-hidden="true" />
                  <Text style={styles.ctaOutlineText}>View on GitHub</Text>
                </TouchableOpacity>
              </View>
            </View>

            {windowWidth >= 768 && (
              <View style={styles.heroRight}>
                <HeroSunGraphic />
              </View>
            )}
          </View>
        </View>

        {/* ── Product Description ── */}
        <View style={styles.sectionWhite}>
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle} accessibilityRole="header">
              Your child's tutor. Their pace. Their place.
            </Text>
            <Text style={styles.productDesc}>
              Sunschool is an AI-powered tutor that meets your kid where they are {'\u2014'} grade level, learning style, speed. Every lesson adapts in real time. No two kids get the same experience.
            </Text>
            <Text style={styles.productDesc}>
              It works on a blue-light-free e-reader tablet that runs on solar and satellite {'\u2014'} no Wi-Fi, no outlet, no classroom required. Backyard. Beach. Backseat. If the sun's out, school's on.
            </Text>
          </View>
        </View>

        {/* ── Trust Bar ── */}
        <View style={styles.trustBar}>
          <View style={styles.trustInner}>
            {[
              { icon: <Globe size={20} color={brand.primary} aria-hidden="true" />, label: 'Open Source' },
              { icon: <BookOpen size={20} color={brand.secondary} aria-hidden="true" />, label: 'K-12' },
              { icon: <Zap size={20} color={brand.amber} aria-hidden="true" />, label: 'AI-Powered' },
              { icon: <Lock size={20} color={brand.green} aria-hidden="true" />, label: 'Parent-Controlled' },
            ].map((item, i) => (
              <View key={i} style={styles.trustItem}>
                {item.icon}
                <Text style={styles.trustLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── What kids experience ── */}
        <View style={styles.sectionTinted}>
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle} accessibilityRole="header">What kids experience</Text>

            <View style={styles.cardGrid}>
              {[
                { icon: <BookOpen size={28} color={brand.white} aria-hidden="true" />, bg: brand.primary, title: 'Lessons that feel like theirs', desc: 'The AI adjusts to how your child actually learns \u2014 not a grade-wide average. Every lesson fits.' },
                { icon: <Award size={28} color={brand.white} aria-hidden="true" />, bg: brand.secondary, title: 'Play, not homework', desc: 'Quizzes feel like games. Challenges feel like puzzles. They\u2019ll ask to do more.' },
                { icon: <Star size={28} color={brand.white} aria-hidden="true" />, bg: brand.green, title: 'Trophies and streaks', desc: 'Badges and milestones keep momentum going. Progress they can see and celebrate.' },
                { icon: <Map size={28} color={brand.white} aria-hidden="true" />, bg: brand.purple, title: 'A map of everything they know', desc: 'Subjects connect visually. Kids see where they\u2019ve been and what\u2019s next \u2014 curiosity does the rest.' },
              ].map((card, i) => (
                <View key={i} style={styles.featureCard}>
                  <View style={[styles.featureIconCircle, { backgroundColor: card.bg }]}>
                    {card.icon}
                  </View>
                  <Text style={styles.featureCardTitle}>{card.title}</Text>
                  <Text style={styles.featureCardDesc}>{card.desc}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── What parents get ── */}
        <View style={styles.sectionWhite}>
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle} accessibilityRole="header">What parents get</Text>

            <View style={styles.cardGrid}>
              {[
                { icon: <Eye size={28} color={brand.white} aria-hidden="true" />, bg: brand.primary, title: 'See everything, in real time', desc: 'Live progress on strengths, gaps, and growth. Not a report card \u2014 a dashboard.' },
                { icon: <Shield size={28} color={brand.white} aria-hidden="true" />, bg: brand.green, title: 'Your data stays yours', desc: 'Nothing gets sold. Nothing trains a model. Export or delete anytime.' },
                { icon: <Users size={28} color={brand.white} aria-hidden="true" />, bg: brand.secondary, title: 'All your kids, one account', desc: 'Each child gets their own adaptive path. Add learners as your family grows.' },
                { icon: <GitHub size={28} color={brand.white} aria-hidden="true" />, bg: brand.text, title: 'Open source, all the way down', desc: 'Read the code. Audit the prompts. Self-host if you want. Education you can verify, not just trust.' },
              ].map((card, i) => (
                <View key={i} style={styles.featureCard}>
                  <View style={[styles.featureIconCircle, { backgroundColor: card.bg }]}>
                    {card.icon}
                  </View>
                  <Text style={styles.featureCardTitle}>{card.title}</Text>
                  <Text style={styles.featureCardDesc}>{card.desc}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── How It Works ── */}
        <View style={styles.sectionTinted}>
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle} accessibilityRole="header">Up and running in minutes</Text>

            <View style={styles.stepsContainer}>
              {[
                { num: '1', color: brand.primary, title: 'Sign up', desc: 'Email and password. No credit card. No trial clock.' },
                { num: '2', color: brand.secondary, title: 'Add your child', desc: 'Name, grade, interests. The AI takes it from there.' },
                { num: '3', color: brand.green, title: 'Start learning', desc: 'Hand them the tablet. Go pour your coffee.' },
              ].map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={[styles.stepCircle, { backgroundColor: step.color }]}>
                    <Text style={styles.stepNum}>{step.num}</Text>
                  </View>
                  <View style={styles.stepContent}>
                    <Text style={styles.stepTitle}>{step.title}</Text>
                    <Text style={styles.stepDesc}>{step.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Testimonials ── */}
        <View style={styles.sectionWhite}>
          <View style={styles.sectionWrap}>
            <Text style={styles.sectionTitle} accessibilityRole="header">From parents using Sunschool</Text>
            <View style={styles.testimonialGrid}>
              {[
                { quote: 'She takes it outside and does math in the hammock. Voluntarily. I have no explanation.', name: 'Sarah M.', detail: 'Parent of a 3rd grader', color: brand.primary },
                { quote: 'I read the source code before my kids touched it. Every ed-tech company should have to clear that bar.', name: 'James T.', detail: 'Parent of 2', color: brand.secondary },
                { quote: 'We travel full-time. Sunschool works on a beach in Portugal or a cabin in Montana \u2014 no Wi-Fi needed.', name: 'Mia L.', detail: 'Homeschool parent', color: brand.green },
              ].map((t, i) => (
                <View key={i} style={[styles.testimonialCard, { borderLeftColor: t.color }]}>
                  <Text style={styles.testimonialQuote}>{'\u201C'}{t.quote}{'\u201D'}</Text>
                  <Text style={styles.testimonialName}>{t.name}</Text>
                  <Text style={styles.testimonialDetail}>{t.detail}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── Final CTA ── */}
        <View style={styles.finalCta}>
          <View style={styles.finalCtaInner}>
            <Text style={styles.finalCtaTitle} accessibilityRole="header">
              School starts when{'\n'}the sun does.
            </Text>
            <Text style={styles.finalCtaNote}>Free forever for core features. No credit card needed.</Text>
            <TouchableOpacity style={styles.finalCtaButton} onPress={goToAuth} accessibilityRole="button" accessibilityLabel="Get Started Free">
              <Text style={styles.finalCtaButtonText}>Get Started Free</Text>
              <ArrowRight size={18} color={brand.white} style={{ marginLeft: 8 }} aria-hidden="true" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={styles.footer} accessibilityRole="contentinfo">
          <View style={styles.footerInner}>
            <View style={styles.footerBrand}>
              <SunIcon size={20} />
              <Text style={styles.footerLogo}>Sunschool</Text>
            </View>
            <Text style={styles.footerTagline}>Part of All One Thing.{'\n'}Open source education for all.</Text>

            <View style={styles.footerLinks} accessibilityRole="list">
              <TouchableOpacity onPress={() => { if (typeof window !== 'undefined') window.location.href = '/privacy'; }} accessibilityRole="link" accessibilityLabel="Privacy Policy">
                <Text style={styles.footerLinkText}>Privacy Policy</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { if (typeof window !== 'undefined') window.location.href = '/terms'; }} accessibilityRole="link" accessibilityLabel="Terms of Service">
                <Text style={styles.footerLinkText}>Terms of Service</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={openGitHub} accessibilityRole="link" accessibilityLabel="GitHub (opens in new window)">
                <Text style={styles.footerLinkText}>GitHub</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { if (typeof window !== 'undefined') window.open('mailto:info@sunschool.xyz'); }} accessibilityRole="link" accessibilityLabel="Contact via email">
                <Text style={styles.footerLinkText}>Contact</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.footerCopy}>&copy; {new Date().getFullYear()} SUNSCHOOL, LLC. A product of All One Thing Labs (allonething.xyz).</Text>
          </View>
        </View>

      </View>
    </ScrollView>
  );
};

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: brand.bg,
  },
  container: {
    flex: 1,
  },

  /* Navbar */
  navbar: {
    width: '100%',
    height: 70,
    backgroundColor: brand.white,
    borderBottomWidth: 1,
    borderBottomColor: brand.divider,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  navInner: {
    width: '100%',
    maxWidth: 1200,
    marginHorizontal: 'auto',
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoText: {
    fontSize: 20,
    fontWeight: '800',
    color: brand.text,
    letterSpacing: 2,
  },
  navLinks: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  navCta: {
    backgroundColor: brand.secondary,
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 24,
  },
  navCtaText: {
    color: brand.white,
    fontSize: 14,
    fontWeight: '600',
  },

  /* Hero */
  hero: {
    backgroundColor: brand.primary,
    backgroundImage: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.primaryDark} 100%)`,
    paddingTop: windowWidth < 768 ? 50 : 80,
    paddingBottom: windowWidth < 768 ? 60 : 90,
    paddingHorizontal: 20,
    alignItems: 'center',
  } as any,
  heroInner: {
    width: '100%',
    maxWidth: 1200,
    marginHorizontal: 'auto',
    flexDirection: windowWidth < 768 ? 'column' : 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 40,
  },
  heroLeft: {
    flex: windowWidth < 768 ? 0 : 1,
    maxWidth: 600,
    width: '100%',
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 3,
    marginBottom: 16,
  },
  heroTitle: {
    fontSize: windowWidth < 768 ? 34 : 50,
    fontWeight: '800',
    color: brand.white,
    lineHeight: windowWidth < 768 ? 42 : 60,
    marginBottom: 20,
    letterSpacing: -0.5,
  },
  heroSub: {
    fontSize: windowWidth < 768 ? 17 : 20,
    lineHeight: windowWidth < 768 ? 26 : 30,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 32,
  },
  heroCtas: {
    flexDirection: windowWidth < 480 ? 'column' : 'row',
    gap: 14,
    alignItems: windowWidth < 480 ? 'stretch' : 'center',
  },
  ctaPrimary: {
    backgroundColor: brand.secondary,
    paddingVertical: 15,
    paddingHorizontal: 28,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPrimaryText: {
    color: brand.white,
    fontSize: 17,
    fontWeight: '700',
  },
  ctaOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 28,
    gap: 8,
  },
  ctaOutlineText: {
    color: brand.white,
    fontSize: 15,
    fontWeight: '600',
  },
  heroRight: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 320,
  },

  /* Product description */
  productDesc: {
    fontSize: windowWidth < 768 ? 16 : 18,
    lineHeight: windowWidth < 768 ? 26 : 30,
    color: brand.textLight,
    textAlign: 'center',
    marginBottom: 16,
    maxWidth: 720,
    marginHorizontal: 'auto',
  },

  /* Trust Bar */
  trustBar: {
    backgroundColor: brand.white,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: brand.divider,
  },
  trustInner: {
    maxWidth: 900,
    marginHorizontal: 'auto',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 16,
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  trustLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: brand.text,
  },

  /* Sections */
  sectionWhite: {
    backgroundColor: brand.white,
    paddingVertical: windowWidth < 768 ? 50 : 80,
    paddingHorizontal: 20,
  },
  sectionTinted: {
    backgroundColor: brand.bg,
    paddingVertical: windowWidth < 768 ? 50 : 80,
    paddingHorizontal: 20,
  },
  sectionWrap: {
    maxWidth: 1200,
    marginHorizontal: 'auto',
    width: '100%',
  },
  sectionTitle: {
    fontSize: windowWidth < 768 ? 26 : 34,
    fontWeight: '700',
    color: brand.text,
    textAlign: 'center',
    marginBottom: 16,
  },

  /* Feature cards */
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 24,
    marginTop: 24,
  },
  featureCard: {
    width: windowWidth < 768 ? '100%' : windowWidth < 1024 ? '46%' : '22%',
    backgroundColor: brand.white,
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    minWidth: 240,
  } as any,
  featureIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  featureCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: brand.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  featureCardDesc: {
    fontSize: 15,
    lineHeight: 23,
    color: brand.textLight,
    textAlign: 'center',
  },

  /* How It Works steps */
  stepsContainer: {
    maxWidth: 600,
    marginHorizontal: 'auto',
    marginTop: 24,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 36,
  },
  stepCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 20,
    flexShrink: 0,
  },
  stepNum: {
    color: brand.white,
    fontSize: 20,
    fontWeight: '700',
  },
  stepContent: {
    flex: 1,
    paddingTop: 4,
  },
  stepTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: brand.text,
    marginBottom: 6,
  },
  stepDesc: {
    fontSize: 15,
    lineHeight: 24,
    color: brand.textLight,
  },

  /* Testimonials */
  testimonialGrid: {
    flexDirection: windowWidth < 768 ? 'column' : 'row',
    gap: 24,
    justifyContent: 'center',
    marginTop: 24,
  },
  testimonialCard: {
    flex: 1,
    minWidth: 260,
    backgroundColor: brand.bg,
    borderRadius: 12,
    padding: 24,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  testimonialQuote: {
    fontSize: 15,
    lineHeight: 24,
    color: brand.text,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  testimonialName: {
    fontSize: 15,
    fontWeight: '700',
    color: brand.text,
  },
  testimonialDetail: {
    fontSize: 13,
    color: brand.textLight,
    marginTop: 2,
  },

  /* Final CTA */
  finalCta: {
    backgroundColor: brand.primary,
    backgroundImage: `linear-gradient(135deg, ${brand.primaryDark} 0%, ${brand.primary} 100%)`,
    paddingVertical: windowWidth < 768 ? 60 : 80,
    paddingHorizontal: 20,
    alignItems: 'center',
  } as any,
  finalCtaInner: {
    maxWidth: 700,
    marginHorizontal: 'auto',
    alignItems: 'center',
  },
  finalCtaTitle: {
    fontSize: windowWidth < 768 ? 28 : 40,
    fontWeight: '800',
    color: brand.white,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: windowWidth < 768 ? 36 : 50,
  },
  finalCtaNote: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
    marginBottom: 28,
  },
  finalCtaButton: {
    backgroundColor: brand.secondary,
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 32,
    flexDirection: 'row',
    alignItems: 'center',
  },
  finalCtaButtonText: {
    color: brand.white,
    fontSize: 19,
    fontWeight: '700',
  },

  /* Footer */
  footer: {
    backgroundColor: '#F0F2F5',
    paddingVertical: 48,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: brand.divider,
  },
  footerInner: {
    maxWidth: 800,
    marginHorizontal: 'auto',
    alignItems: 'center',
  },
  footerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  footerLogo: {
    fontSize: 20,
    fontWeight: '700',
    color: brand.text,
  },
  footerTagline: {
    fontSize: 15,
    color: brand.textLight,
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  footerLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: windowWidth < 480 ? 16 : 28,
    marginBottom: 24,
  },
  footerLinkText: {
    fontSize: 14,
    color: brand.text,
    fontWeight: '500',
  },
  footerCopy: {
    fontSize: 13,
    color: brand.textLight,
    textAlign: 'center',
  },
});

export default WelcomePage;

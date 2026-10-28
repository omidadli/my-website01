import React from 'react';
import { Page, Theme } from '../types';
import { useContent } from '../context/ContentContext';
import { EditableText } from '../components/cms/EditableText';
import { Mail, Phone, MapPin, Send, MessageCircle, Linkedin, Instagram, Twitter, ShieldCheck } from 'lucide-react';
import { linkProps, navigate, pathForPage, pathForProduct } from '../utils/router';
import { safeRecordArray } from '../utils/contentDefaults';
import { resolveProduct, isProductPromotable } from './ProductPromo';
import { PRODUCT_IDS } from '../data/productPromo';

interface FooterProps {
  theme: Theme;
  onNavigate: (page: Page) => void;
  onOpenAdminModal?: () => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate, onOpenAdminModal }) => {
  const { data } = useContent();
  const personal = data.PERSONAL_INFO;
  const navItems = safeRecordArray<NonNullable<typeof data.NAVIGATION_MENU[number]>>(data.NAVIGATION_MENU)
    .filter((item) => typeof item.pageSlug === 'string' && typeof item.label === 'string')
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .filter((item) => !item.isHidden);
  const services = safeRecordArray<NonNullable<typeof data.SERVICES[number]>>(data.SERVICES)
    .filter((service) => typeof service.id === 'string' && typeof service.title === 'string')
    .slice(0, 5);
  // Products are promoted site-wide from the footer too — disabled ones drop out.
  const footerProducts = PRODUCT_IDS.filter((id) => isProductPromotable(data, id)).map((id) =>
    resolveProduct(data, id),
  );

  const socials = [
    { id: 'telegram', href: personal.telegramUrl, icon: Send, label: 'تلگرام' },
    { id: 'whatsapp', href: personal.whatsappUrl, icon: MessageCircle, label: 'واتساپ' },
    { id: 'linkedin', href: personal.linkedin, icon: Linkedin, label: 'لینکدین' },
    { id: 'instagram', href: personal.instagram, icon: Instagram, label: 'اینستاگرام' },
    { id: 'x', href: personal.xTwitter, icon: Twitter, label: 'ایکس' },
  ];

  return (
    <footer className="relative z-10 mt-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 pb-28 sm:pb-24">
        <div className="nd-card rounded-[var(--nd-radius-panel)] p-8 sm:p-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
            {/* Brand */}
            <div className="space-y-4 lg:col-span-1">
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-2xl nd-grad grid place-items-center text-white text-lg font-black shadow-sm">
                  ع
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-black text-[color:var(--nd-ink)]">{personal.name}</span>
                  <span className="block text-[10px] font-bold text-[color:var(--nd-faint)]">{personal.title}</span>
                </span>
              </div>
              <p className="text-xs leading-relaxed nd-muted">
                <EditableText path="PERSONAL_INFO.bio" multiline>{personal.bio}</EditableText>
              </p>
              <span className="nd-chip bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)] border-transparent">
                <span className="w-1.5 h-1.5 rounded-full bg-current inline-block" />
                <EditableText path="PERSONAL_INFO.availability">{personal.availability}</EditableText>
              </span>
            </div>

            {/* Quick links */}
            <nav className="space-y-3">
              <h4 className="text-xs font-black text-[color:var(--nd-ink)]">دسترسی سریع</h4>
              <ul className="space-y-2.5">
                {navItems.map((item) => (
                  <li key={item.id}>
                    <a
                      {...linkProps(pathForPage(item.pageSlug), () => onNavigate(item.pageSlug as Page))}
                      className="text-xs font-bold nd-muted hover:text-[color:var(--nd-accent)] transition-colors cursor-pointer"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Services */}
            <nav className="space-y-3">
              <h4 className="text-xs font-black text-[color:var(--nd-ink)]">خدمات</h4>
              <ul className="space-y-2.5">
                {services.map((s) => (
                  <li key={s.id}>
                    <a
                      {...linkProps(pathForPage('services'), () => onNavigate('services'))}
                      className="text-xs font-bold nd-muted hover:text-[color:var(--nd-accent)] transition-colors cursor-pointer text-right"
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Products — every page links to the tools */}
            <nav className="space-y-3">
              <h4 className="text-xs font-black text-[color:var(--nd-ink)]">دستیارهای هوشمند</h4>
              <ul className="space-y-2.5">
                {footerProducts.map((p) => (
                  <li key={p.id}>
                    <a
                      {...linkProps(pathForProduct(p.id), () => navigate(pathForProduct(p.id)))}
                      className="text-xs font-bold nd-muted hover:text-[color:var(--nd-accent)] transition-colors cursor-pointer text-right"
                    >
                      {p.name}
                    </a>
                  </li>
                ))}
                <li>
                  <a
                    {...linkProps(pathForPage('products'), () => navigate(pathForPage('products')))}
                    className="text-xs font-black text-[color:var(--nd-accent)] hover:underline transition-colors cursor-pointer text-right"
                  >
                    همه ابزارها و تعرفه‌ها
                  </a>
                </li>
              </ul>
            </nav>

            {/* Contact */}
            <div className="space-y-3">
              <h4 className="text-xs font-black text-[color:var(--nd-ink)]">ارتباط مستقیم</h4>
              <ul className="space-y-2.5 text-xs font-bold nd-muted">
                <li>
                  <a href={`mailto:${personal.email}`} className="flex items-center gap-2 hover:text-[color:var(--nd-accent)] transition-colors dir-ltr justify-start">
                    <Mail className="w-3.5 h-3.5 shrink-0" />
                    <span>{personal.email}</span>
                  </a>
                </li>
                <li>
                  <a href={`tel:${personal.phone}`} className="flex items-center gap-2 hover:text-[color:var(--nd-accent)] transition-colors">
                    <Phone className="w-3.5 h-3.5 shrink-0" />
                    <span className="dir-ltr">{personal.phoneFormatted}</span>
                  </a>
                </li>
                <li className="flex items-center gap-2">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>{personal.location}</span>
                </li>
              </ul>
              <div className="flex items-center gap-2 pt-2">
                {socials.map((s) => (
                  <a
                    key={s.id}
                    href={s.href}
                    target="_blank"
                    rel="noreferrer"
                    title={s.label}
                    aria-label={s.label}
                    className="w-9 h-9 rounded-full border border-[color:var(--nd-line)] grid place-items-center text-[color:var(--nd-muted)] hover:text-[color:var(--nd-bg)] hover:bg-[color:var(--nd-ink)] hover:border-[color:var(--nd-ink)] transition-all"
                  >
                    <s.icon className="w-3.5 h-3.5" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="mt-10 pt-6 border-t border-[color:var(--nd-line)] flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] font-bold nd-muted">
            <span>
              © {new Date().getFullYear()} {personal.name} — تمام حقوق محفوظ است.
            </span>
            <span className="flex items-center gap-4">
              <span className="dir-ltr text-[color:var(--nd-faint)]">{personal.website}</span>
              {onOpenAdminModal && (
                <button
                  onClick={onOpenAdminModal}
                  className="flex items-center gap-1.5 hover:text-[color:var(--nd-accent)] transition-colors cursor-pointer"
                  title="ورود به پنل مدیریت"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>پنل مدیریت</span>
                </button>
              )}
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

import React from 'react';
import { Layers, ArrowRight } from 'lucide-react';
import { useContent } from '../context/ContentContext';
import { EditableText } from '../components/cms/EditableText';
import { SectionEditHeader } from '../components/cms/SectionEditHeader';
import { PageHero } from '../components/nd/Kit';
import { ProductPromoStrip } from '../components/ProductPromo';
import { productsForPage } from '../data/productPromo';
import { Page, Theme } from '../types';

interface ProjectsPageProps {
  theme?: Theme;
  onNavigate: (page: Page) => void;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({ theme = 'dark', onNavigate }) => {
  const isDark = theme === 'dark';
  const { data } = useContent();
  const projectsData = data.PROJECTS_PAGE_DATA;
  const projectsList = Array.isArray(data.ONGOING_PROJECTS)
    ? data.ONGOING_PROJECTS.filter((project) => project && typeof project === 'object')
    : [];

  return (
    <div className="space-y-14 py-4 max-w-5xl mx-auto">
      <PageHero
        theme={theme}
        page="projects"
        title={projectsData.headline}
        subtitle={projectsData.subheadline}
        badge={projectsData.badge}
        onNavigate={onNavigate}
      >
        <div className="nd-chip bg-[color:var(--nd-mint-soft)] text-[color:var(--nd-success)] px-5 py-2.5 text-xs font-extrabold inline-flex items-center gap-2" style={{ background: 'var(--nd-mint-soft)', color: 'var(--nd-success)', borderColor: 'transparent' }}>
          <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
          <EditableText path="PROJECTS_PAGE_DATA.capacityText">{projectsData.capacityText}</EditableText>
        </div>
      </PageHero>

      <section className="space-y-8">
        <SectionEditHeader title="پروژه‌ها و وضعیت‌های جاری و سابق" arrayPath="ONGOING_PROJECTS" />
        <h2 className={`nd-h2 text-xl sm:text-2xl flex items-center gap-3 ${isDark ? 'text-white' : ''}`}>
          <span className="w-1.5 h-7 rounded-full" style={{ background: 'var(--nd-accent)' }} aria-hidden />
          <EditableText path="PROJECTS_PAGE_DATA.sectionTitle">{projectsData.sectionTitle}</EditableText>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {projectsList.map((proj, idx) => {
            const isOngoing = proj.status === 'در حال اجرا';
            return (
              <div key={proj.id || idx} className="nd-card nd-card-hover p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <span className={`font-extrabold text-base ${isDark ? 'text-white' : ''}`}>
                    <EditableText path={`ONGOING_PROJECTS.${idx}.title`}>{proj.title}</EditableText>
                  </span>
                  <span
                    className="nd-chip shrink-0"
                    style={
                      isOngoing
                        ? { background: 'var(--nd-peach-soft)', color: '#d97706', borderColor: 'transparent' }
                        : { background: 'var(--nd-mint-soft)', color: 'var(--nd-success)', borderColor: 'transparent' }
                    }
                  >
                    <EditableText path={`ONGOING_PROJECTS.${idx}.status`}>{proj.status}</EditableText>
                  </span>
                </div>
                <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm leading-relaxed`}>
                  <EditableText path={`ONGOING_PROJECTS.${idx}.description`} multiline>{proj.description}</EditableText>
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section className={`${isDark ? 'nd-stage nd-hairline-top' : 'nd-panel'} rounded-[var(--nd-radius-panel)] p-8 sm:p-10 text-center space-y-5`}>
        <h3 className={`nd-h2 text-lg sm:text-xl ${isDark ? 'text-white' : ''}`}>
          <EditableText path="PROJECTS_PAGE_DATA.portfolioHeadline">{projectsData.portfolioHeadline}</EditableText>
        </h3>
        <p className={`${isDark ? 'text-slate-400' : 'nd-muted'} text-sm max-w-2xl mx-auto leading-relaxed`}>
          <EditableText path="PROJECTS_PAGE_DATA.portfolioBody" multiline>{projectsData.portfolioBody}</EditableText>
        </p>
        <button onClick={() => onNavigate('portfolio')} className={`nd-btn ${isDark ? 'bg-white text-[#17171c] hover:bg-slate-200' : 'nd-btn-accent'} px-7 py-3.5 text-xs sm:text-sm`}>
          <span>
            <EditableText path="PROJECTS_PAGE_DATA.portfolioCta">{projectsData.portfolioCta}</EditableText>
          </span>
          <ArrowRight className="w-4 h-4 rotate-180" />
        </button>
      </section>

      {/* ظرفیت من محدود است؛ این ابزارها همان روش تحلیل را ۲۴ ساعته در اختیار دارند */}
      <ProductPromoStrip
        productIds={productsForPage('projects')}
        theme={theme}
        onNavigate={onNavigate}
        topic="strategy-decision"
        eyebrow="ظرفیت پروژه محدود است"
        title="تا نوبتِ همکاری برسد، تصمیم‌هایت را معطل نگذار"
        desc="اگر الان ظرفیت پروژه‌ی جدید ندارم، این ابزارها همان چارچوب تحلیل و اولویت‌بندی را شبانه‌روزی در اختیارت می‌گذارند — با ۵۰۰ سکه هدیه."
        gridClassName="grid grid-cols-1 md:grid-cols-2 gap-5"
      />
    </div>
  );
};

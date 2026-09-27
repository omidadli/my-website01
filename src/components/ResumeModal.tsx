import React from 'react';
import { Theme } from '../types';
import { X, Download, Award, Briefcase, GraduationCap, CheckCircle2, Sparkles, Building2, BookOpen, Star, MessageCircle, Send, Linkedin, Mail, Instagram, Twitter } from 'lucide-react';
import { PERSONAL_INFO, TIMELINE, SELECT_PROJECTS, EDUCATION_AND_COURSES, ALL_SKILLS_LIST, OTHER_COLLABORATIONS } from '../data/content';

interface ResumeModalProps {
  theme: Theme;
  onClose: () => void;
}

export const ResumeModal: React.FC<ResumeModalProps> = ({ theme, onClose }) => {
  const isDark = theme === 'dark';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xl overflow-y-auto">
      <div className={`relative w-full max-w-4xl max-h-[90dvh] overflow-y-auto rounded-[40px] p-6 sm:p-10 border shadow-2xl ${
        isDark ? 'bg-[#1a1240] border-white/20 text-white' : 'bg-white border-slate-200 text-slate-900'
      }`}>
        {/* Close Button */}
        <button
          onClick={onClose}
          className={`absolute top-6 left-6 p-3 rounded-full transition-colors ${
            isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
          }`}
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Profile */}
        <div className={`flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-8 border-b ${
          isDark ? 'border-white/10' : 'border-slate-200'
        }`}>
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-[#8b5cf6] via-[#4c8dff] to-[#5ce1e6] p-1 shrink-0 shadow-lg">
            <div className={`w-full h-full rounded-[20px] flex items-center justify-center font-black text-2xl ${
              isDark ? 'bg-[#0f0a2e] text-white' : 'bg-white text-[#1a1240]'
            }`}>
              OA
            </div>
          </div>

          <div className="text-center sm:text-right space-y-3 flex-1">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <h2 className="text-2xl sm:text-3xl font-black">{PERSONAL_INFO.name}</h2>
              <a
                href={PERSONAL_INFO.whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="glow-btn px-5 py-2.5 rounded-full text-xs font-bold text-white flex items-center gap-2 cursor-pointer shadow-md"
              >
                <MessageCircle className="w-4 h-4 text-emerald-400" />
                <span>ارتباط در واتساپ ({PERSONAL_INFO.phoneFormatted})</span>
              </a>
            </div>

            <p className={`text-xs font-bold ${isDark ? 'text-[#5ce1e6]' : 'text-[#2563eb]'}`}>{PERSONAL_INFO.title}</p>
            <p className={`text-xs leading-relaxed max-w-2xl ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {PERSONAL_INFO.bio}
            </p>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
              <a href={PERSONAL_INFO.whatsappUrl} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1.5 hover:bg-emerald-500/30">
                <MessageCircle className="w-3.5 h-3.5" />
                <span>واتساپ</span>
              </a>
              <a href={PERSONAL_INFO.telegramUrl} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-lg bg-sky-500/20 text-sky-600 dark:text-sky-300 text-[11px] font-bold flex items-center gap-1.5 hover:bg-sky-500/30">
                <Send className="w-3.5 h-3.5" />
                <span>تلگرام</span>
              </a>
              <a href={PERSONAL_INFO.linkedin} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-300 text-[11px] font-bold flex items-center gap-1.5 hover:bg-blue-500/30">
                <Linkedin className="w-3.5 h-3.5" />
                <span>لینکدین</span>
              </a>
              <a href={PERSONAL_INFO.instagram} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-lg bg-pink-500/20 text-pink-600 dark:text-pink-300 text-[11px] font-bold flex items-center gap-1.5 hover:bg-pink-500/30">
                <Instagram className="w-3.5 h-3.5" />
                <span>اینستاگرام</span>
              </a>
              <a href={`mailto:${PERSONAL_INFO.email}`} className="px-3 py-1 rounded-lg bg-violet-500/20 text-violet-600 dark:text-violet-300 text-[11px] font-bold flex items-center gap-1.5 hover:bg-violet-500/30">
                <Mail className="w-3.5 h-3.5" />
                <span>ایمیل</span>
              </a>
            </div>
          </div>
        </div>

        {/* Work Experiences */}
        <div className="py-6 space-y-6">
          <div className="flex items-center gap-2 text-sm font-black text-[#8b5cf6]">
            <Briefcase className="w-5 h-5" />
            <span>سوابق شغلی (Work Experience)</span>
          </div>

          <div className="space-y-4 text-xs">
            {TIMELINE.map((exp, idx) => (
              <div key={idx} className={`p-5 rounded-2xl border space-y-2 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`flex flex-wrap items-center justify-between gap-2 font-bold text-sm ${
                  isDark ? 'text-white' : 'text-[#1a1240]'
                }`}>
                  <span>{exp.title} — <span className={isDark ? 'text-[#5ce1e6]' : 'text-[#2563eb]'}>{exp.company}</span></span>
                  <span className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{exp.year}</span>
                </div>
                <p className={`leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{exp.description}</p>
                <div className={`pt-2 flex items-center gap-2 font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>دستاوردها: {exp.achievement}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Projects */}
        <div className={`py-6 border-t space-y-4 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
          <div className={`flex items-center gap-2 text-sm font-black ${isDark ? 'text-[#5ce1e6]' : 'text-[#2563eb]'}`}>
            <Star className="w-5 h-5" />
            <span>پروژه‌های منتخب</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {SELECT_PROJECTS.map((proj, idx) => (
              <div key={idx} className={`p-4 rounded-xl border space-y-1 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'
              }`}>
                <div className={`flex items-center justify-between font-bold ${isDark ? 'text-white' : 'text-[#1a1240]'}`}>
                  <span>{proj.title}</span>
                  <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{proj.date}</span>
                </div>
                <p className={`text-[11px] font-semibold ${isDark ? 'text-[#5ce1e6]' : 'text-[#2563eb]'}`}>{proj.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Other Collaborations */}
        <div className={`py-6 border-t space-y-4 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2 text-sm font-black text-[#4c8dff]">
            <Building2 className="w-5 h-5" />
            <span>سایر همکاری‌ها</span>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {OTHER_COLLABORATIONS.map((collab, idx) => (
              <div key={idx} className={`px-4 py-2 rounded-xl border flex items-center gap-2 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'
              }`}>
                <span className={`font-bold ${isDark ? 'text-white' : 'text-[#1a1240]'}`}>{collab.company}</span>
                <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>— {collab.role}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Education & Courses */}
        <div className={`py-6 border-t space-y-4 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
          <div className="flex items-center gap-2 text-sm font-black text-amber-500">
            <GraduationCap className="w-5 h-5" />
            <span>تحصیلات و دوره‌ها</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <h4 className={`font-bold ${isDark ? 'text-white' : 'text-[#1a1240]'}`}>تحصیلات:</h4>
              {EDUCATION_AND_COURSES.education.map((edu, idx) => (
                <div key={idx} className={`p-3.5 rounded-xl border space-y-1 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className={`font-bold ${isDark ? 'text-white' : 'text-[#1a1240]'}`}>{edu.title}</div>
                  <div className={isDark ? 'text-slate-400' : 'text-slate-500'}>{edu.institute} · {edu.year} · {edu.grade}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <h4 className={`font-bold ${isDark ? 'text-white' : 'text-[#1a1240]'}`}>دوره‌های تخصصی:</h4>
              {EDUCATION_AND_COURSES.courses.map((crs, idx) => (
                <div key={idx} className={`p-3.5 rounded-xl border space-y-1 ${
                  isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className={`font-bold ${isDark ? 'text-[#5ce1e6]' : 'text-[#2563eb]'}`}>{crs.title}</div>
                  <div className={isDark ? 'text-slate-400' : 'text-slate-500'}>{crs.provider} · {crs.date}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className={`pt-6 border-t flex justify-end ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
          <button
            onClick={onClose}
            className={`px-6 py-2.5 rounded-full text-xs font-bold transition-colors cursor-pointer ${
              isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
            }`}
          >
            بستن رزومه
          </button>
        </div>
      </div>
    </div>
  );
};

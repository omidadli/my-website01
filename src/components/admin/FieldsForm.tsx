import React, { useState } from 'react';
import { useContent } from '../../context/ContentContext';
import { AInput, ATextarea, ASelect, AToggle, ALabel } from './ui';
import { MediaField } from './MediaField';
import { SeoBox, SeoKey, SeoValues } from './SeoBox';
import { BLOG_CATEGORIES, BLOG_CATEGORY_GROUPS, findCategory } from '../../data/blogTaxonomy';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Recursive field engine — powers every editor in the CMS.           */
/* ------------------------------------------------------------------ */

export type FieldDef =
  | { key: string; label: string; type?: 'text'; placeholder?: string; dir?: 'ltr' | 'rtl'; hint?: string; half?: boolean }
  | { key: string; label: string; type: 'textarea'; rows?: number; placeholder?: string; hint?: string }
  | { key: string; label: string; type: 'number'; min?: number; max?: number; hint?: string; half?: boolean }
  | { key: string; label: string; type: 'toggle'; hint?: string }
  | { key: string; label: string; type: 'select'; options: (string | { value: string; label: string })[]; half?: boolean }
  /** Taxonomy-backed blog category: writes `category` (English) and `categoryFa` (Persian) together. */
  | { key: string; label: string; type: 'category'; hint?: string }
  | { key: string; label: string; type: 'image'; hint?: string; resetTo?: { value: string; label: string } }
  | { key: string; label: string; type: 'tags'; placeholder?: string; hint?: string }
  | { key: string; label: string; type: 'group'; fields: FieldDef[]; hint?: string }
  | { key: string; label: string; type: 'items'; singular: string; fields: FieldDef[]; defaults?: Record<string, any> }
  | { key: string; label: string; type: 'seo'; urlPrefix?: string };

interface FieldsFormProps {
  /** Dot-path to the object being edited, e.g. 'BLOG_POSTS.2' or 'PERSONAL_INFO'. */
  basePath: string;
  /** The object's current value. */
  item: any;
  fields: FieldDef[];
}

const TagsEditor: React.FC<{ values: string[]; onChange: (v: string[]) => void; placeholder?: string }> = ({ values, onChange, placeholder }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft('');
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((t, i) => (
          <span key={i} className="nd-chip gap-1.5 pl-1.5">
            <span>{t}</span>
            <button type="button" onClick={() => onChange(values.filter((_, j) => j !== i))} className="cursor-pointer opacity-60 hover:opacity-100" aria-label={`حذف ${t}`}>
              <Trash2 className="w-3 h-3" />
            </button>
          </span>
        ))}
        {values.length === 0 && <span className="text-[10px] nd-muted">موردی اضافه نشده است.</span>}
      </div>
      <div className="flex gap-2">
        <AInput
          value={draft}
          placeholder={placeholder || 'تایپ کنید و Enter بزنید…'}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" onClick={add} className="nd-btn nd-btn-ghost px-3 py-2 text-[11px] shrink-0 cursor-pointer">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const FieldsForm: React.FC<FieldsFormProps> = ({ basePath, item, fields }) => {
  const { updateField } = useContent();
  if (!item) return null;
  const set = (key: string, v: any) => updateField(`${basePath}.${key}`, v);

  const renderField = (f: FieldDef) => {
    const value = item[f.key];
    switch (f.type) {
      case 'textarea':
        return (
          <div key={f.key} className="sm:col-span-2">
            <ALabel hint={f.hint}>{f.label}</ALabel>
            <ATextarea rows={f.rows || 4} value={value || ''} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} />
          </div>
        );
      case 'number':
        return (
          <div key={f.key} className={f.half ? '' : 'sm:col-span-2'}>
            <ALabel hint={f.hint}>{f.label}</ALabel>
            <AInput type="number" dir="ltr" min={f.min} max={f.max} value={value ?? ''} onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))} className="text-left" />
          </div>
        );
      case 'toggle':
        return (
          <div key={f.key} className="sm:col-span-2 flex items-center justify-between rounded-xl border border-[color:var(--nd-line)] bg-[color:var(--nd-bg-soft)] p-3.5">
            <span className="text-xs font-extrabold text-[color:var(--nd-ink-2)]">{f.label}{f.hint && <span className="block text-[10px] font-bold text-[color:var(--nd-faint)] mt-0.5">{f.hint}</span>}</span>
            <AToggle checked={!!value} onChange={(v) => set(f.key, v)} />
          </div>
        );
      case 'select':
        return (
          <div key={f.key} className="sm:col-span-2">
            <ALabel>{f.label}</ALabel>
            <ASelect value={value ?? ''} onChange={(e) => set(f.key, e.target.value)}>
              {f.options.map((o) => {
                const opt = typeof o === 'string' ? { value: o, label: o } : o;
                return (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                );
              })}
            </ASelect>
          </div>
        );
      case 'category': {
        // One choice keeps `category` and `categoryFa` in sync — the pair the blog
        // filter chips are built from. A value outside the taxonomy (legacy post)
        // is preserved as an extra option so saving never silently rewrites it.
        const active = findCategory(value) ?? BLOG_CATEGORIES.find((c) => c.fa === item.categoryFa);
        const legacy = !active && (value || item.categoryFa)
          ? { value: String(value || ''), fa: String(item.categoryFa || value || '') }
          : null;
        const apply = (categoryValue: string) => {
          const c = BLOG_CATEGORIES.find((x) => x.value === categoryValue);
          set('category', c ? c.value : categoryValue);
          set('categoryFa', c ? c.fa : (legacy?.fa ?? ''));
        };
        return (
          <div key={f.key} className="sm:col-span-2">
            <ALabel hint={f.hint || 'انتخاب از taxonomy سایت — فیلترهای وبلاگ از همین مقدار ساخته می‌شوند'}>{f.label}</ALabel>
            <ASelect value={active?.value ?? legacy?.value ?? ''} onChange={(e) => apply(e.target.value)}>
              <option value="">— بدون دسته‌بندی —</option>
              {legacy && <option value={legacy.value}>{`${legacy.fa} (مقدار قدیمی)`}</option>}
              {BLOG_CATEGORY_GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {BLOG_CATEGORIES.filter((c) => c.group === group).map((c) => (
                    <option key={c.value} value={c.value}>{c.fa}</option>
                  ))}
                </optgroup>
              ))}
            </ASelect>
          </div>
        );
      }
      case 'image':
        return (
          <div key={f.key} className="sm:col-span-2">
            <MediaField label={f.label} value={value} onChange={(v) => set(f.key, v)} hint={f.hint} resetTo={f.resetTo} />
          </div>
        );
      case 'tags':
        return (
          <div key={f.key} className="sm:col-span-2">
            <ALabel hint={f.hint}>{f.label}</ALabel>
            <TagsEditor values={Array.isArray(value) ? value : []} onChange={(v) => set(f.key, v)} placeholder={f.placeholder} />
          </div>
        );
      case 'group':
        return (
          <div key={f.key} className="sm:col-span-2 rounded-2xl border border-[color:var(--nd-line)] bg-[color:var(--nd-bg-soft)] p-4 space-y-3">
            <ALabel hint={f.hint}>{f.label}</ALabel>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <FieldsForm basePath={`${basePath}.${f.key}`} item={value || {}} fields={f.fields} />
            </div>
          </div>
        );
      case 'items': {
        const arr: any[] = Array.isArray(value) ? value : [];
        return (
          <div key={f.key} className="sm:col-span-2 space-y-2.5">
            <div className="flex items-center justify-between">
              <ALabel>{f.label} <span className="text-[color:var(--nd-faint)]">({arr.length})</span></ALabel>
              <button
                type="button"
                onClick={() => set(f.key, [...arr, { ...(f.defaults || {}), id: `it-${Date.now()}-${Math.floor(Math.random() * 999)}` }])}
                className="nd-btn nd-btn-ghost px-3 py-1.5 text-[10px] cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>افزودن {f.singular}</span>
              </button>
            </div>
            {arr.length === 0 && <p className="text-[10px] nd-muted rounded-xl border border-dashed border-[color:var(--nd-line-strong)] p-3 text-center">خالی است — اولین «{f.singular}» را اضافه کنید.</p>}
            {arr.map((sub, i) => (
              <div key={sub?.id || i} className="rounded-2xl border border-[color:var(--nd-line)] bg-[color:var(--nd-surface)] p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold text-[color:var(--nd-faint)]">{f.singular} {i + 1}</span>
                  <span className="flex gap-1">
                    <button type="button" disabled={i === 0} onClick={() => set(f.key, arr.map((x, j) => (j === i - 1 ? arr[i] : j === i ? arr[i - 1] : x)))} className="p-1 rounded-lg hover:bg-[color:var(--nd-bg-soft)] disabled:opacity-30 cursor-pointer" aria-label="بالا">
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" disabled={i === arr.length - 1} onClick={() => set(f.key, arr.map((x, j) => (j === i + 1 ? arr[i] : j === i ? arr[i + 1] : x)))} className="p-1 rounded-lg hover:bg-[color:var(--nd-bg-soft)] disabled:opacity-30 cursor-pointer" aria-label="پایین">
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => set(f.key, arr.filter((_, j) => j !== i))} className="p-1 rounded-lg text-[#dc2626] hover:bg-[#fee2e2] cursor-pointer" aria-label="حذف">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FieldsForm basePath={`${basePath}.${f.key}.${i}`} item={sub} fields={f.fields} />
                </div>
              </div>
            ))}
          </div>
        );
      }
      case 'seo': {
        const seoValues: SeoValues = { status: item.status, slug: item.slug, ...(item.seo || {}) };
        return (
          <div key={f.key} className="sm:col-span-2">
            <SeoBox
              values={seoValues}
              urlPrefix={f.urlPrefix}
              titleForSlug={item.title || item.name || item.label}
              onChange={(k: SeoKey, v) => {
                if (k === 'status' || k === 'slug') set(k, v);
                else set(`seo.${k}`, v);
              }}
            />
          </div>
        );
      }
      default:
        return (
          <div key={f.key} className={f.half ? '' : 'sm:col-span-2'}>
            <ALabel hint={f.hint}>{f.label}</ALabel>
            <AInput dir={f.dir} value={value ?? ''} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} className={f.dir === 'ltr' ? 'text-left' : ''} />
          </div>
        );
    }
  };

  return <>{fields.map(renderField)}</>;
};

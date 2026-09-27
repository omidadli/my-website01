import React, { useMemo, useState } from 'react';
import { useContent } from '../../context/ContentContext';
import { FieldDef, FieldsForm } from './FieldsForm';
import { ACard, ASectionTitle, ABadge, AInput, AConfirm } from './ui';
import { Plus, Trash2, Copy, ChevronUp, ChevronDown, ChevronLeft, Search } from 'lucide-react';

export interface CollectionPreview {
  title: string;
  subtitle?: string;
  image?: string;
  badges?: { text: string; tone?: 'ok' | 'warn' | 'accent' | 'muted' }[];
}

interface CollectionEditorProps {
  title: string;
  desc?: string;
  arrayPath: string;
  fields: FieldDef[];
  defaults: Record<string, any> | (() => Record<string, any>);
  preview: (item: any, idx: number) => CollectionPreview;
  addLabel?: string;
  searchPlaceholder?: string;
  extraActions?: (item: any, idx: number) => React.ReactNode;
}

/** WordPress-style list + editor for any content collection (posts, services, …). */
export const CollectionEditor: React.FC<CollectionEditorProps> = ({
  title,
  desc,
  arrayPath,
  fields,
  defaults,
  preview,
  addLabel = 'افزودن آیتم جدید',
  searchPlaceholder = 'جستجو…',
  extraActions,
}) => {
  const { data, addItem, removeItem, moveItem, duplicateItem } = useContent();
  const items: any[] = useMemo(() => {
    const parts = arrayPath.split('.');
    let cur: any = data;
    for (const p of parts) cur = cur?.[p];
    return Array.isArray(cur) ? cur : [];
  }, [data, arrayPath]);

  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);
  const [query, setQuery] = useState('');

  const filtered = items
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => {
      if (!query.trim()) return true;
      return JSON.stringify(item).toLowerCase().includes(query.trim().toLowerCase());
    });

  const handleAdd = () => {
    const tpl = typeof defaults === 'function' ? defaults() : { ...defaults };
    addItem(arrayPath, tpl);
    setOpenIdx(0); // addItem prepends
  };

  return (
    <div className="space-y-4">
      <ASectionTitle
        title={`${title} (${items.length})`}
        desc={desc}
        action={
          <button type="button" onClick={handleAdd} className="nd-btn nd-btn-accent px-5 py-2.5 text-xs cursor-pointer">
            <Plus className="w-4 h-4" />
            <span>{addLabel}</span>
          </button>
        }
      />

      {items.length > 5 && (
        <div className="relative max-w-sm">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--nd-faint)]" />
          <AInput className="pr-10" placeholder={searchPlaceholder} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      )}

      <div className="space-y-3">
        {filtered.length === 0 && (
          <ACard className="text-center py-10">
            <p className="text-xs nd-muted">آیتمی یافت نشد.</p>
          </ACard>
        )}
        {filtered.map(({ item, idx }) => {
          const p = preview(item, idx);
          const isOpen = openIdx === idx;
          return (
            <ACard key={item?.id || idx} className={isOpen ? 'p-0! overflow-hidden' : 'p-0! overflow-hidden'}>
              {/* Row header */}
              <div className="flex items-center gap-3 p-4">
                {p.image && (
                  <img src={p.image} alt="" loading="lazy" decoding="async" width={48} height={48} className="w-12 h-12 rounded-xl object-cover border border-[color:var(--nd-line)] shrink-0" referrerPolicy="no-referrer" />
                )}
                <button type="button" onClick={() => setOpenIdx(isOpen ? null : idx)} className="flex-1 min-w-0 text-right cursor-pointer group">
                  <span className="block text-xs sm:text-sm font-extrabold text-[color:var(--nd-ink)] truncate group-hover:text-[color:var(--nd-accent)] transition-colors">
                    {p.title || 'بدون عنوان'}
                  </span>
                  {p.subtitle && <span className="block text-[10px] nd-muted truncate mt-0.5">{p.subtitle}</span>}
                </button>
                <span className="flex items-center gap-1.5 shrink-0">
                  {p.badges?.map((b, bi) => (
                    <ABadge key={bi} tone={b.tone}>{b.text}</ABadge>
                  ))}
                </span>
                <span className="flex items-center gap-0.5 shrink-0">
                  <button type="button" title="انتقال به بالا" disabled={idx === 0} onClick={() => moveItem(arrayPath, idx, idx - 1)} className="p-1.5 rounded-lg hover:bg-[color:var(--nd-bg-soft)] disabled:opacity-25 cursor-pointer">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button type="button" title="انتقال به پایین" disabled={idx === items.length - 1} onClick={() => moveItem(arrayPath, idx, idx + 1)} className="p-1.5 rounded-lg hover:bg-[color:var(--nd-bg-soft)] disabled:opacity-25 cursor-pointer">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button type="button" title="تکثیر" onClick={() => duplicateItem(arrayPath, idx)} className="p-1.5 rounded-lg hover:bg-[color:var(--nd-bg-soft)] cursor-pointer">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button type="button" title="حذف" onClick={() => setConfirmIdx(idx)} className="p-1.5 rounded-lg text-[#dc2626] hover:bg-[#fee2e2] cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setOpenIdx(isOpen ? null : idx)} className="p-1.5 rounded-lg hover:bg-[color:var(--nd-bg-soft)] cursor-pointer" aria-label={isOpen ? 'بستن' : 'ویرایش'}>
                    <ChevronLeft className={`w-4 h-4 transition-transform ${isOpen ? '-rotate-90' : ''}`} />
                  </button>
                </span>
              </div>

              {/* Expanded editor */}
              <div className={`grid transition-all duration-300 ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <div className="px-4 pb-5 pt-1 border-t border-[color:var(--nd-line)]">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-4">
                      <FieldsForm basePath={`${arrayPath}.${idx}`} item={item} fields={fields} />
                    </div>
                    {extraActions && <div className="flex flex-wrap gap-2 pt-4">{extraActions(item, idx)}</div>}
                  </div>
                </div>
              </div>
            </ACard>
          );
        })}
      </div>

      <AConfirm
        open={confirmIdx !== null}
        message="این آیتم برای همیشه حذف می‌شود. برای امنیت بیشتر، قبل از حذف از بخش «تنظیمات» یک نسخه پشتیبان (اسنپ‌شات) بگیرید. ادامه می‌دهید؟"
        onCancel={() => setConfirmIdx(null)}
        onConfirm={() => {
          if (confirmIdx !== null) {
            removeItem(arrayPath, confirmIdx);
            setOpenIdx(null);
          }
          setConfirmIdx(null);
        }}
      />
    </div>
  );
};

import { useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowClockwise, BookOpen, Buildings, CalendarBlank, CaretDown, CaretRight, Check, Crosshair, DotsThree, Fire, Flag, PuzzlePiece, Shapes, Sparkle, Sword, Tag } from '@phosphor-icons/react';
import { SteamEvents } from './SteamEvents';
import { useLocale } from './LocaleProvider';
import { groupGenres } from './genre-groups';
import { genreLabel } from './genre-labels';
import { DEFAULT_FILTERS, type Filters } from './rules';
import './filter-panel.css';

type Source = 'popular' | 'discover' | 'deals' | `event:${string}`;
const groupIcons = { action: Crosshair, rpg: Sword, strategy: Buildings, casual: PuzzlePiece, sports: Flag, story: BookOpen, features: Shapes, other: DotsThree };
const sourceChoices = [
  { value: 'popular', label: '熱門暢銷', Icon: Fire },
  { value: 'discover', label: '新品', Icon: Sparkle },
  { value: 'deals', label: '折扣', Icon: Tag },
] as const;
const platformChoices = [{ value: 'all', label: '全部' }, { value: 'windows', label: 'Windows' }, { value: 'mac', label: 'macOS' }, { value: 'linux', label: 'Linux' }] as const;
const priceChoices = [{ value: 'all', label: '不限' }, { value: 'free', label: '免費' }, { value: 'under300', label: 'NT$300 以下' }, { value: 'paid', label: '付費遊戲' }] as const;
const playerChoices = [{ value: 'all', label: '不限' }, { value: 'single', label: '單人' }, { value: 'multi', label: '多人／合作' }] as const;
const earlyChoices = [{ value: 'all', label: '不限' }, { value: 'only', label: '只看搶先體驗' }, { value: 'exclude', label: '排除搶先體驗' }] as const;
const adultChoices = [{ value: 'all', label: '不限' }, { value: 'only', label: '只看成人' }, { value: 'exclude', label: '排除成人' }] as const;

function Choice<T extends string>({ name, value, current, onSelect, children }: { name: string; value: T; current: T; onSelect: (value: T) => void; children: ReactNode }) {
  return <label className={`filter-choice${current === value ? ' is-selected' : ''}`}>
    <input type="radio" name={name} value={value} checked={current === value} onChange={() => onSelect(value)} />
    <span className="filter-choice-label">{children}</span><Check className="filter-choice-check" aria-hidden="true" />
  </label>;
}

export function FilterPanel({ filters, source, genres, onChange, onRefresh, loading, onClose }: { filters: Filters; source: Source; genres: string[]; onChange: (filters: Filters, source: Source) => void; onRefresh: () => void; loading: boolean; onClose: () => void }) {
  const { t, locale } = useLocale();
  const id = useId();
  const [draft, setDraft] = useState(filters);
  const [draftSource, setDraftSource] = useState(source);
  const [eventsOpen, setEventsOpen] = useState(source.startsWith('event:'));
  // Browsing a category only opens its choices; it never silently applies a tag.
  const groups = useMemo(() => groupGenres(genres), [genres]);
  const [openGroup, setOpenGroup] = useState<string | null>(() => groups.find(group => group.genres.includes(filters.genre))?.id ?? null);
  const [advanced, setAdvanced] = useState(filters.adult !== 'all' || filters.earlyAccess !== 'all');
  const activeGroup = groups.find(group => group.id === openGroup);
  const genreText = (value: string) => locale === 'zh-TW' ? genreLabel(value) : value;
  const update = <K extends keyof Filters>(key: K, value: Filters[K]) => setDraft(current => ({ ...current, [key]: value }));
  const selected = (Object.keys(draft) as (keyof Filters)[]).filter(key => draft[key] !== DEFAULT_FILTERS[key]);
  const reset = () => { setDraft({ ...DEFAULT_FILTERS }); setDraftSource('popular'); setEventsOpen(false); setOpenGroup(null); setAdvanced(false); };

  return <>
    <div className="consumer-filter-content filter-layout">
      <fieldset className="filter-source"><legend>{t('候選來源')}</legend>
        <div className="filter-source-options">{sourceChoices.map(({ value, label, Icon }) => <Choice key={value} name={`${id}-source`} value={value} current={draftSource} onSelect={() => { setDraftSource(value); setEventsOpen(false); }}><Icon aria-hidden="true" /><span>{t(label)}</span></Choice>)}<button type="button" className={`filter-event-entry${eventsOpen || draftSource.startsWith('event:') ? ' is-selected' : ''}`} aria-expanded={eventsOpen} onClick={() => setEventsOpen(!eventsOpen)}><CalendarBlank aria-hidden="true" /><span>Steam 活動</span><CaretDown aria-hidden="true" /></button></div>
      </fieldset>
      {eventsOpen && <SteamEvents selected={draftSource.startsWith('event:') ? draftSource.slice(6) : null} onSelect={id => setDraftSource(id ? `event:${id}` : 'popular')} />}
      <>
      <section className="filter-genre-section" aria-labelledby={`${id}-genre-heading`}>
        <div className="filter-section-heading"><h3 id={`${id}-genre-heading`}>{t('遊戲類型')}</h3>
          <button className={`filter-all-genres${draft.genre === 'all' ? ' is-selected' : ''}`} type="button" aria-pressed={draft.genre === 'all'} onClick={() => { update('genre', 'all'); setOpenGroup(null); }}>{t('全部')}{draft.genre === 'all' && <Check aria-hidden="true" />}</button>
        </div>
        <div className="filter-category-grid">{groups.map(group => {
          const Icon = groupIcons[group.id as keyof typeof groupIcons] ?? Shapes;
          const isOpen = openGroup === group.id;
          const hasSelection = group.genres.includes(draft.genre);
          return <button key={group.id} type="button" className={`filter-category${isOpen ? ' is-open' : ''}${hasSelection ? ' has-selection' : ''}`} aria-expanded={isOpen} aria-controls={`${id}-genres`} onClick={() => setOpenGroup(isOpen ? null : group.id)}>
            <Icon aria-hidden="true" /><span>{t(group.title)}</span>{hasSelection ? <Check aria-hidden="true" /> : <CaretRight className="filter-category-caret" aria-hidden="true" />}
          </button>;
        })}</div>
        <div id={`${id}-genres`} hidden={!activeGroup} className="filter-genre-detail">
          {activeGroup && <fieldset><legend>{t(activeGroup.title)}</legend><div className="filter-tag-options">{activeGroup.genres.map(genre => <Choice key={genre} name={`${id}-genre`} value={genre} current={draft.genre} onSelect={value => update('genre', value)}>{genreText(genre)}</Choice>)}</div></fieldset>}
        </div>
      </section>

      <div className="filter-primary-rows">
        <fieldset className="filter-row"><legend>{t('遊玩人數')}</legend><div className="filter-row-options">{playerChoices.map(choice => <Choice key={choice.value} name={`${id}-players`} value={choice.value} current={draft.players} onSelect={value => update('players', value)}>{t(choice.label)}</Choice>)}</div></fieldset>
        <fieldset className="filter-row"><legend>{t('價格')}</legend><div className="filter-row-options">{priceChoices.map(choice => <Choice key={choice.value} name={`${id}-price`} value={choice.value} current={draft.price} onSelect={value => update('price', value)}>{t(choice.label)}</Choice>)}</div></fieldset>
        <fieldset className="filter-row"><legend>{t('平台')}</legend><div className="filter-row-options">{platformChoices.map(choice => <Choice key={choice.value} name={`${id}-platform`} value={choice.value} current={draft.platform} onSelect={value => update('platform', value)}>{t(choice.label)}</Choice>)}</div></fieldset>
      </div>

      <div className="filter-ai-row"><label className="consumer-ai-switch"><span>{t('排除已揭露 AI 內容')}</span><input type="checkbox" role="switch" checked={draft.ai === 'exclude'} onChange={event => update('ai', event.target.checked ? 'exclude' : 'all')} /></label></div>

      <section className="filter-advanced">
        <button type="button" className="filter-advanced-toggle" aria-expanded={advanced} aria-controls={`${id}-advanced`} onClick={() => setAdvanced(!advanced)}><span>{t('進階篩選')}</span><span>{t('搶先體驗')} · {t('成人內容')}<CaretDown aria-hidden="true" /></span></button>
        <div id={`${id}-advanced`} className="filter-advanced-content" hidden={!advanced}>
          <fieldset className="filter-row"><legend>{t('搶先體驗')}</legend><div className="filter-row-options">{earlyChoices.map(choice => <Choice key={choice.value} name={`${id}-early`} value={choice.value} current={draft.earlyAccess} onSelect={value => update('earlyAccess', value)}>{t(choice.label)}</Choice>)}</div></fieldset>
          <fieldset className="filter-row"><legend>{t('成人內容')}</legend><div className="filter-row-options">{adultChoices.map(choice => <Choice key={choice.value} name={`${id}-adult`} value={choice.value} current={draft.adult} onSelect={value => update('adult', value)}>{t(choice.label)}</Choice>)}</div></fieldset>
        </div>
      </section>
      <button type="button" className="consumer-refresh filter-refresh" disabled={loading} onClick={onRefresh}><ArrowClockwise className={loading ? 'consumer-spinning' : ''} aria-hidden="true" />{loading ? t('更新中…') : t('更新遊戲資料')}</button>
      </>
    </div>
    <div className="consumer-filter-actions filter-panel-actions"><button type="button" onClick={reset}>{t('清除')}</button><button type="button" className="consumer-apply" onClick={() => { onChange(draft, draftSource); onClose(); }}>{t('套用篩選')}{selected.length > 0 && <span className="filter-apply-count">{selected.length}</span>}</button></div>
  </>;
}

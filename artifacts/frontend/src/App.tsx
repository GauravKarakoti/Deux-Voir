import { type ChangeEvent, type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient, useQuery } from '@tanstack/react-query';
import {
  getGetAdminDashboardQueryKey,
  getGetAdminPaperQueryKey,
  getGetAdminSessionQueryKey,
  getGetHomePapersQueryKey,
  getListAdminPapersQueryKey,
  getListPublicPapersQueryKey,
  useCreatePaper,
  useDeletePaper,
  useGetAdminDashboard,
  useGetAdminPaper,
  useGetAdminSession,
  useGetHomePapers,
  useGetPublicPaper,
  useListAdminPapers,
  useListPublicPapers,
  useLoginAdmin,
  useLogoutAdmin,
  useSetPaperPublished,
  useUpdatePaper,
  useUploadResearchImage,
} from '@workspace/api-client-react';
import { ArrowLeft, ArrowUpRight, Eye, LogOut, Plus, RefreshCw, Upload } from 'lucide-react';
import { Link, Route, Switch, useLocation, useParams } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import RichTextEditor from '@/components/rich-text-editor';

const queryClient = new QueryClient();

type Summary = {
  id: string; slug: string; title: string; shortTitle: string | null; summary: string | null; abstract: string;
  status: string; venue: string | null; authors: { name: string; affiliation: string | null; profileUrl: string | null; sortOrder: number }[];
  submittedDate: string | null; year: number; keywords: string[]; featured: boolean; published: boolean; updatedAt: string;
};
type PaperData = Summary & { content: string; externalLinks: { label: string; url: string }[]; seoImage: string | null; createdAt: string };
type PaperFields = {
  slug: string; title: string; shortTitle: string; summary: string; abstract: string; content: string; status: string; venue: string;
  authors: string; submittedDate: string; year: string; keywords: string; featured: boolean; published: boolean;
  externalLinks: string; seoImage: string;
};

type PeerReview = {
  id: string;
  reviewerName: string;
  conference: string;
  paperCount: number;
};

const blankFields: PaperFields = {
  slug: '', title: '', shortTitle: '', summary: '', abstract: '', content: '', status: 'Preprint', venue: '',
  authors: '', submittedDate: '', year: String(new Date().getFullYear()), keywords: '',
  featured: false, published: false, externalLinks: '', seoImage: '',
};

const getArray = (data: any): any[] => {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') {
    if (Array.isArray(data.papers)) return data.papers;
    if (Array.isArray(data.data)) return data.data;
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.results)) return data.results;
    const values = Object.values(data);
    const found = values.find(Array.isArray);
    if (found) return found as any[];
  }
  return [];
};

const authorsToText = (authors: PaperData['authors']) => authors.map((author) => [author.name, author.affiliation ?? '', author.profileUrl ?? ''].join(' | ').replace(/\s+\|\s+$/, '')).join('\n');
const linksToText = (links: PaperData['externalLinks']) => links.map((link) => `${link.label} | ${link.url}`).join('\n');
const fieldsFromPaper = (paper: PaperData): PaperFields => ({
  slug: paper.slug, title: paper.title, shortTitle: paper.shortTitle ?? '', summary: paper.summary ?? '', abstract: paper.abstract, content: paper.content,
  status: paper.status, venue: paper.venue ?? '', authors: authorsToText(paper.authors),
  submittedDate: paper.submittedDate?.slice(0, 10) ?? '', year: String(paper.year), keywords: paper.keywords.join(', '),
  featured: paper.featured, published: paper.published, externalLinks: linksToText(paper.externalLinks), seoImage: paper.seoImage ?? '',
});
const dateLabel = (date?: string | null) => date ? new Date(date).toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : '';
const authorLabel = (authors: Summary['authors']) => authors.map((a) => a.name).join(' · ');
const queryError = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong while loading this page.';
const slugify = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180);

function setMeta(selector: string, attribute: 'name' | 'property', content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, selector.match(/["']([^"']+)["']/)?.[1] ?? '');
    document.head.appendChild(element);
  }
  element.content = content;
}

function usePageMetadata(title: string, description: string, image?: string, noIndex = false) {
  const [location] = useLocation();
  useEffect(() => {
    document.title = title;
    setMeta('meta[name="description"]', 'name', description);
    setMeta('meta[property="og:title"]', 'property', title);
    setMeta('meta[property="og:description"]', 'property', description);
    setMeta('meta[property="og:type"]', 'property', location.startsWith('/research/') ? 'article' : 'website');
    setMeta('meta[property="og:url"]', 'property', `${window.location.origin}${location}`);
    setMeta('meta[property="og:image"]', 'property', image ?? '');
    setMeta('meta[name="twitter:title"]', 'name', title);
    setMeta('meta[name="twitter:description"]', 'name', description);
    setMeta('meta[name="twitter:image"]', 'name', image ?? '');
    setMeta('meta[name="robots"]', 'name', noIndex ? 'noindex, nofollow' : 'index, follow');
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${window.location.origin}${location}`;
  }, [title, description, image, noIndex, location]);
}

function SiteHeader() {
  return <header className="site-header">
    <Link href="/" className="brand" aria-label="Deux Voir homepage"><img src="/logo.png" alt="Deux Voir logo" className="brand-seal" /><span className="brand-name">Deux Voir</span></Link>
    <nav className="site-nav" aria-label="Main navigation"><Link href="/research">Research</Link></nav>
  </header>;
}
function SiteFooter() {
  return <footer className="site-footer"><div className="footer-left"><span className="footer-mark">deux voir</span><span className="footer-tag">— to see twice</span></div></footer>;
}
function PublicFrame({ children }: { children: ReactNode }) {
  return <><SiteHeader/><main className="wide-main">{children}</main><SiteFooter/></>;
}
function LoadingState({ label = 'Loading research' }: { label?: string }) {
  return <div className="state-wrap" role="status" aria-live="polite"><p className="eyebrow">{label}</p><div className="skeleton" style={{ width: '82%' }}/><div className="skeleton" style={{ width: '57%' }}/><div className="skeleton" style={{ width: '91%', height: 76 }}/></div>;
}
function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  return <div className="state-wrap" role="alert"><p className="eyebrow">Unable to load</p><h2 className="state-title">The archive is temporarily unavailable.</h2><p className="state-copy">{queryError(error)}</p><button className="button" onClick={retry} data-testid="button-retry"><RefreshCw size={14}/> Try again</button></div>;
}
function PaperCard({ paper }: { paper: Summary }) {
  return <article className="paper-card" data-testid={`paper-${paper.id}`}>
    <div className="paper-meta"><span className="paper-status">{paper.status || 'Research'}</span>{paper.venue && <span className="paper-venue">{paper.venue}</span>}</div>
    <h2 className="paper-title"><Link href={`/research/${paper.slug}`} data-testid={`link-paper-${paper.id}`}>{paper.title}</Link></h2>
    <p className="paper-authors">{authorLabel(paper.authors)}</p>
    <p className="paper-abstract">{paper.summary ?? paper.abstract}</p>
    <div className="paper-links"><Link className="text-link" href={`/research/${paper.slug}`}>Read paper <ArrowUpRight size={13}/></Link></div>
  </article>;
}
function HomePage() {
  const papers = useGetHomePapers();
  const papersList = getArray(papers.data) as Summary[];
  const reviewsQuery = useQuery({
    queryKey: ['peerReviews'],
    queryFn: async () => {
      const res = await fetch('/api/reviews');
      if (!res.ok) throw new Error('Failed to load reviews');
      return res.json() as Promise<PeerReview[]>;
    }
  });
  
  const reviewsList = reviewsQuery.data || [];
  const reviewsByReviewer = reviewsList.reduce((acc, review) => {
    if (!acc[review.reviewerName]) acc[review.reviewerName] = [];
    acc[review.reviewerName].push(review);
    return acc;
  }, {} as Record<string, PeerReview[]>);

  usePageMetadata(
    'Deux Voir — Independent Research',
    'Deux Voir is an independent research identity exploring world models as memory substrates for multimodal reasoning.',
  );
  return <PublicFrame>
    <section className="hero">
      <p className="eyebrow">Independent researchers · est. 2026</p>
      <h1 className="hero-title">World models, AI Safety<br/>&amp; Applied AI</h1>
      <p className="hero-lede">Deux Voir is a small, independent research team and identity investigating the topics of learned world-models; their latent representations, and LLM inferencing, fine-tuning.</p>
    </section>
    {papers.isLoading && <LoadingState label="Selected work"/>}
    {papers.isError && <ErrorState error={papers.error} retry={() => void papers.refetch()}/>}
    {papers.isSuccess && <section className="work" aria-labelledby="selected-work"><p className="section-label" id="selected-work">Selected work</p>
      {papersList.length ? papersList.map((paper) => <PaperCard key={paper.id} paper={paper}/>) : <p className="work-footnote">Research will appear here as it becomes ready.</p>}
      <p className="work-footnote">More work, including models, tools, and experiments, will appear as it is ready.</p>
    </section>}
    
    {reviewsList.length > 0 && (
      <section className="work">
        <p className="section-label">Peer reviewing contribution</p>
        <p className="about-text" style={{ fontSize: 19, marginBottom: 22 }}>We have peer reviewing for the following conferences and journals.</p>
        {Object.entries(reviewsByReviewer).map(([reviewer, revs]) => (
          <div key={reviewer} style={{ marginBottom: 24 }}>
            <h2 className="paper-title" style={{ marginBottom: 6 }}>{reviewer}</h2>
            {revs.map((r) => (
              <p key={r.id} className="paper-authors">{r.conference}: {r.paperCount} paper{r.paperCount !== 1 ? 's' : ''} reviewed</p>
            ))}
          </div>
        ))}
      </section>
    )}
    
    <section className="about-strip"><p className="section-label">The lab</p><p className="about-text">Deux Voir is a small, independent research identity exploring world models as memory substrates for multimodal reasoning. We are interested in the intersection of learned world models, latent representations, and language model reasoning. Our work is open-source and we welcome collaboration.</p></section>
  </PublicFrame>;
}
function ResearchIndex() {
  const papers = useListPublicPapers();
  const papersList = getArray(papers.data) as Summary[];
  const years = useMemo(() => papers.data ? Array.from(new Set(papersList.map((p) => p.year))).sort((a, b) => b - a) : [], [papersList, papers.data]);
  usePageMetadata(
    'Research Papers & Experiments — Deux Voir',
    'Papers and research from Deux Voir, an independent research identity exploring world models as memory substrates for multimodal reasoning.',
  );
  return <PublicFrame>
    <section className="page-head"><p className="eyebrow">Research</p><h1 className="page-title">Papers &amp; experiments</h1><p className="page-lede">Work published by us submitted to various conferences and workshops.</p></section>
    {papers.isLoading && <LoadingState/>}
    {papers.isError && <ErrorState error={papers.error} retry={() => void papers.refetch()}/>}
    {papers.isSuccess && (papersList.length
      ? years.map((year) => <section className="work" key={year}><p className="section-label">{year}</p>{papersList.filter((paper) => paper.year === year).map((paper) => <PaperCard key={paper.id} paper={paper}/>)}</section>)
      : <section className="state-wrap"><p className="eyebrow">Research archive</p><h2 className="state-title">No papers published yet.</h2><p className="state-copy">New research will be listed here when it is ready to share.</p></section>)}
  </PublicFrame>;
}
function PublicPaperPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const paper = useGetPublicPaper(slug);
  const record = paper.data as PaperData | undefined;
  usePageMetadata(
    record ? `${record.shortTitle ?? record.title} — Deux Voir` : 'Research paper — Deux Voir',
    record?.summary ?? record?.abstract ?? 'Research and papers from Deux Voir.',
    record?.seoImage ?? undefined,
  );
  if (paper.isLoading) return <PublicFrame><LoadingState label="Research paper"/></PublicFrame>;
  if (paper.isError || !record) return <PublicFrame><ErrorState error={paper.error} retry={() => void paper.refetch()}/></PublicFrame>;
  const abstractParagraphs = record.abstract.split(/\n\s*\n/).filter(Boolean);
  return <PublicFrame><article className="paper-page">
    <Link className="back-link" href="/research"><ArrowLeft size={13}/> All research</Link>
    {record.seoImage && <img src={record.seoImage} alt="" style={{ width: '100%', height: 'auto', marginBottom: 28 }}/>}
    <header className="paper-header">
      <div className="paper-meta"><span className="paper-status">{record.status || 'Research'}</span>{record.venue && <span className="paper-venue">{record.venue}</span>}</div>
      <h1 className="paper-page-title">{record.title}</h1>
      <p className="paper-page-authors">{authorLabel(record.authors)}</p>
      <p className="paper-page-date">{record.submittedDate ? `Submitted ${dateLabel(record.submittedDate)} · ` : ''}{record.year}</p>
      {record.externalLinks.length > 0 && <div className="paper-links" style={{ marginTop: 22 }}>{record.externalLinks.map((link) => <a className="text-link" key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer">{link.label}<ArrowUpRight size={12}/></a>)}</div>}
    </header>
    {record.abstract && <section className="paper-section"><h2 className="paper-section-title">Abstract</h2>{abstractParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>}
    {record.keywords.length > 0 && <p className="paper-keywords"><strong>Keywords:</strong> {record.keywords.join(' · ')}</p>}
    {record.content && <section className="paper-section prose-editorial" dangerouslySetInnerHTML={{ __html: record.content }}/>}
  </article></PublicFrame>;
}

function AdminHeader() {
  const [, navigate] = useLocation();
  const logout = useLogoutAdmin();
  const client = useQueryClient();
  const onLogout = () => logout.mutate(undefined, { onSuccess: async () => {
    await client.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() });
    navigate('/admin/login');
  } });
  return <header className="admin-top">
    <Link className="brand" href="/admin"><img src="/logo.png" alt="Deux Voir logo" className="brand-seal" /><span className="brand-name">Deux Voir <span style={{ fontSize: 12, color: 'var(--ink-mute)' }}>/ studio</span></span></Link>
    <div className="admin-top-right"><Link href="/">View site</Link><button className="button button-quiet" onClick={onLogout} disabled={logout.isPending} data-testid="button-logout"><LogOut size={14}/> Sign out</button></div>
  </header>;
}
function AdminFrame({ children }: { children: ReactNode }) {
  usePageMetadata('Deux Voir Studio — Private publishing', 'Private research publishing studio.', undefined, true);
  return <div className="admin-shell"><AdminHeader/><main className="admin-main">{children}</main></div>;
}
function SessionGate({ children }: { children: ReactNode }) {
  const [, navigate] = useLocation();
  const session = useGetAdminSession();
  useEffect(() => { if (session.data && !session.data.authenticated) navigate('/admin/login'); }, [session.data, navigate]);
  if (session.isLoading) return <main className="admin-main"><LoadingState label="Checking session"/></main>;
  if (session.isError) return <main className="admin-main"><ErrorState error={session.error} retry={() => void session.refetch()}/></main>;
  if (!session.data?.authenticated) return null;
  return <>{children}</>;
}
function AdminLogin() {
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');
  const [, navigate] = useLocation();
  const login = useLoginAdmin();
  const client = useQueryClient();
  const session = useGetAdminSession();
  usePageMetadata('Sign in — Deux Voir Studio', 'Private administrator sign-in for Deux Voir.', undefined, true);
  useEffect(() => { if (session.data?.authenticated) navigate('/admin'); }, [session.data, navigate]);
  const submit = (event: FormEvent) => {
    event.preventDefault(); setFormError('');
    login.mutate({ data: { password } }, { onSuccess: async () => {
      await client.invalidateQueries({ queryKey: getGetAdminSessionQueryKey() });
      navigate('/admin');
    }, onError: (error) => setFormError(queryError(error)) });
  };
  return <><SiteHeader/><main className="login-panel">
    <p className="eyebrow">Private publishing portal</p><h1 className="login-heading">Sign in</h1><p className="login-sub">Administrator access for Deux Voir research.</p>
    {formError && <div className="notice error" role="alert">{formError}</div>}
    <form onSubmit={submit} className="field" style={{ marginTop: 24 }}>
      <label className="field-label" htmlFor="admin-password">Password</label><input className="control" id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-admin-password"/>
      <button className="button button-solid" type="submit" disabled={login.isPending} data-testid="button-admin-login">{login.isPending ? 'Signing in…' : 'Enter studio'}</button>
    </form>
  </main><SiteFooter/></>;
}
function AdminDashboard() {
  const dashboard = useGetAdminDashboard();
  const allPapers = useListAdminPapers();
  const papersList = getArray(allPapers.data) as Summary[];
  
  // Peer Reviews query
  const reviewsQuery = useQuery({
    queryKey: ['peerReviews'],
    queryFn: async () => {
      const res = await fetch('/api/reviews');
      if (!res.ok) throw new Error('Failed to load reviews');
      return res.json() as Promise<PeerReview[]>;
    }
  });
  const reviewsList = reviewsQuery.data || [];
  
  const publish = useSetPaperPublished();
  const client = useQueryClient();
  const refresh = () => { void dashboard.refetch(); void allPapers.refetch(); reviewsQuery.refetch(); };
  const togglePublish = (paper: Summary) => publish.mutate({ id: paper.id, data: { published: !paper.published } }, { onSuccess: async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }),
      client.invalidateQueries({ queryKey: getListAdminPapersQueryKey() }),
      client.invalidateQueries({ queryKey: getGetAdminPaperQueryKey(paper.id) }),
      client.invalidateQueries({ queryKey: getListPublicPapersQueryKey() }),
      client.invalidateQueries({ queryKey: getGetHomePapersQueryKey() }),
    ]);
  } });
  
  if (dashboard.isLoading || allPapers.isLoading) return <AdminFrame><LoadingState label="Studio dashboard"/></AdminFrame>;
  if (dashboard.isError) return <AdminFrame><ErrorState error={dashboard.error} retry={refresh}/></AdminFrame>;
  if (allPapers.isError) return <AdminFrame><ErrorState error={allPapers.error} retry={refresh}/></AdminFrame>;
  
  const stats = dashboard.data;
  const recentlyUpdated = getArray(stats?.recentlyUpdated) as Summary[];
  
  return <AdminFrame>
    <div className="admin-row"><div><p className="admin-kicker">Publishing studio</p><h1 className="admin-title">Good work, in progress.</h1></div><Link href="/admin/papers/new" className="button button-solid" data-testid="link-create-paper"><Plus size={14}/> New paper</Link></div>
    <section className="admin-stats" aria-label="Research totals">
      <div className="admin-stat"><span className="admin-stat-value">{stats?.totalPapers ?? 0}</span><span className="admin-stat-label">Total papers</span></div>
      <div className="admin-stat"><span className="admin-stat-value">{stats?.publishedPapers ?? 0}</span><span className="admin-stat-label">Published</span></div>
      <div className="admin-stat"><span className="admin-stat-value">{stats?.drafts ?? 0}</span><span className="admin-stat-label">Drafts</span></div>
    </section>
    
    <div className="admin-row" style={{ marginBottom: 14 }}><div><p className="admin-kicker">Your collection</p><h2 style={{ fontSize: 27, fontWeight: 400, margin: 0 }}>Papers</h2></div><span className="admin-meta">{papersList.length} records</span></div>
    {!papersList.length ? <div className="notice">The collection is empty. Create a paper to begin the archive.</div> : <table className="admin-table"><thead><tr><th>Title</th><th>Status</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{papersList.map((paper) => <tr key={paper.id} data-testid={`row-paper-${paper.id}`}>
      <td><Link className="admin-paper-title" href={`/admin/papers/${paper.id}/edit`}>{paper.title}</Link><span className="admin-meta">{authorLabel(paper.authors)} · {paper.year}</span></td>
      <td><span className={`status-chip ${paper.published ? 'published' : ''}`}>{paper.published ? 'Published' : 'Draft'}</span></td>
      <td className="admin-meta">{dateLabel(paper.updatedAt)}</td>
      <td><div className="button-row"><Link className="button" href={`/admin/papers/${paper.id}/edit`}>Edit</Link><Link className="button" href={`/admin/papers/${paper.id}/preview`}><Eye size={13}/> Preview</Link><button className="button" onClick={() => togglePublish(paper)} disabled={publish.isPending} data-testid={`button-publish-${paper.id}`}>{paper.published ? 'Unpublish' : 'Publish'}</button></div></td>
    </tr>)}</tbody></table>}
    
    <div className="admin-row" style={{ marginTop: 55, marginBottom: 14 }}>
      <div>
        <p className="admin-kicker">Contributions</p>
        <h2 style={{ fontSize: 27, fontWeight: 400, margin: 0 }}>Peer Reviews</h2>
      </div>
      <Link href="/admin/reviews/new" className="button button-solid"><Plus size={14}/> Add review</Link>
    </div>
    {!reviewsList.length ? (
      <div className="notice">No review contributions recorded.</div>
    ) : (
      <table className="admin-table">
        <thead>
          <tr>
            <th>Reviewer Name</th>
            <th>Conference / Journal</th>
            <th>Papers Reviewed</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {reviewsList.map((review) => (
            <tr key={review.id}>
              <td><Link className="admin-paper-title" href={`/admin/reviews/${review.id}/edit`}>{review.reviewerName}</Link></td>
              <td><span className="admin-meta">{review.conference}</span></td>
              <td className="admin-meta">{review.paperCount}</td>
              <td>
                <div className="button-row">
                  <Link className="button" href={`/admin/reviews/${review.id}/edit`}>Edit</Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )}
    
    <section style={{ marginTop: 55 }}><p className="admin-kicker">Recently updated</p>{recentlyUpdated.length ? <div>{recentlyUpdated.slice(0, 4).map((paper) => <p className="admin-meta" key={paper.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--rule)' }}><Link href={`/admin/papers/${paper.id}/edit`} style={{ color: 'var(--ink)', font: '17px var(--app-font-serif)' }}>{paper.title}</Link><span style={{ float: 'right' }}>{dateLabel(paper.updatedAt)}</span></p>)}</div> : <p className="state-copy">Nothing updated yet.</p>}</section>
  </AdminFrame>;
}

function ReviewEditor({ mode }: { mode: 'create' | 'edit' }) {
  const params = useParams<{ id?: string }>();
  const id = params.id ?? '';
  const [fields, setFields] = useState({ reviewerName: '', conference: '', paperCount: 1 });
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [, navigate] = useLocation();
  const client = useQueryClient();
  
  const isEdit = mode === 'edit';
  
  const { data, isLoading, isError } = useQuery({
    queryKey: ['peerReview', id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/reviews/${id}`);
      if (!res.ok) throw new Error('Failed to fetch review');
      return res.json() as Promise<PeerReview>;
    },
    enabled: isEdit && Boolean(id),
  });

  useEffect(() => {
    if (isEdit && data) {
      setFields({ reviewerName: data.reviewerName, conference: data.conference, paperCount: data.paperCount });
    }
  }, [isEdit, data]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(''); setErrorMessage('');
    
    try {
      const res = await fetch(isEdit ? `/api/admin/reviews/${id}` : '/api/admin/reviews', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save review');
      }
      
      await client.invalidateQueries({ queryKey: ['peerReviews'] });
      setMessage('Saved.');
      if (!isEdit) {
        navigate('/admin');
      }
    } catch (error) {
      setErrorMessage(queryError(error));
    }
  };

  const onDelete = async () => {
    if (!window.confirm('Delete this review permanently? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/admin/reviews/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete review');
      await client.invalidateQueries({ queryKey: ['peerReviews'] });
      navigate('/admin');
    } catch (error) {
      setErrorMessage(queryError(error));
    }
  };

  if (isEdit && isLoading) return <AdminFrame><LoadingState label="Opening review"/></AdminFrame>;
  if (isEdit && isError) return <AdminFrame><ErrorState error={new Error('Failed')} retry={() => {}}/></AdminFrame>;

  return (
    <AdminFrame>
      <Link className="back-link" href="/admin"><ArrowLeft size={13}/> Back to dashboard</Link>
      <div className="admin-row">
        <div>
          <p className="admin-kicker">{isEdit ? 'Editing contribution' : 'New contribution'}</p>
          <h1 className="admin-title">{isEdit ? 'Edit review' : 'Add a review'}</h1>
        </div>
      </div>
      {message && <div className="notice" role="status" style={{ marginBottom: 18 }}>{message}</div>}
      {errorMessage && <div className="notice error" role="alert" style={{ marginBottom: 18 }}>{errorMessage}</div>}
      <form onSubmit={submit} className="form-grid">
        <label className="field full">
          <span className="field-label">Reviewer Name *</span>
          <input className="control" required value={fields.reviewerName} onChange={e => setFields(f => ({ ...f, reviewerName: e.target.value }))} placeholder="Arjun Srivastava"/>
        </label>
        <label className="field full">
          <span className="field-label">Conference / Journal *</span>
          <input className="control" required value={fields.conference} onChange={e => setFields(f => ({ ...f, conference: e.target.value }))} placeholder="NeurIPS 2026 (Workshop Track)"/>
        </label>
        <label className="field full">
          <span className="field-label">Papers Reviewed *</span>
          <input className="control" type="number" min="1" required value={fields.paperCount} onChange={e => setFields(f => ({ ...f, paperCount: parseInt(e.target.value) || 0 }))}/>
        </label>
        <div className="field full button-row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--rule)', paddingTop: 20 }}>
          <div className="button-row">
            <button className="button button-solid" type="submit">{isEdit ? 'Save changes' : 'Create review'}</button>
            <Link href="/admin" className="button">Cancel</Link>
          </div>
          {isEdit && <button className="button button-danger" type="button" onClick={onDelete}>Delete</button>}
        </div>
      </form>
    </AdminFrame>
  );
}

function PaperEditor({ mode }: { mode: 'create' | 'edit' }) {
  const params = useParams<{ id?: string }>();
  const id = params.id ?? '';
  const paper = useGetAdminPaper(id, { query: { enabled: mode === 'edit' && Boolean(id), queryKey: getGetAdminPaperQueryKey(id) } });
  const [fields, setFields] = useState<PaperFields>(blankFields);
  const [initializedId, setInitializedId] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [slugEdited, setSlugEdited] = useState(mode === 'edit');
  const [, navigate] = useLocation();
  const client = useQueryClient();
  const create = useCreatePaper();
  const update = useUpdatePaper();
  const remove = useDeletePaper();
  const upload = useUploadResearchImage();
  useEffect(() => {
    if (mode === 'edit' && paper.data && initializedId !== id) {
      setFields(fieldsFromPaper(paper.data as PaperData)); setInitializedId(id);
    }
  }, [mode, paper.data, initializedId, id]);
  const set = (key: keyof PaperFields, value: string | boolean) => setFields((current) => ({ ...current, [key]: value }));
  const parsedAuthors = fields.authors.split('\n').map((row) => row.split('|').map((part) => part.trim())).filter((parts) => parts[0]).map((parts) => ({ name: parts[0], affiliation: parts[1] || null, profileUrl: parts[2] || null }));
  const parsedLinks = fields.externalLinks.split('\n').map((row) => row.split('|')).filter((parts) => parts.length >= 2 && parts[0].trim() && parts.slice(1).join('|').trim()).map((parts) => ({ label: parts[0].trim(), url: parts.slice(1).join('|').trim() }));
  const payload = {
    slug: fields.slug.trim(), title: fields.title.trim(), shortTitle: fields.shortTitle.trim() || null,
    summary: fields.summary.trim() || null, abstract: fields.abstract, content: fields.content, status: fields.status, venue: fields.venue.trim() || null,
    authors: parsedAuthors, submittedDate: fields.submittedDate ? new Date(`${fields.submittedDate}T00:00:00.000Z`).toISOString() : null, year: Number(fields.year),
    keywords: fields.keywords.split(',').map((word) => word.trim()).filter(Boolean),
    featured: fields.featured, published: fields.published, externalLinks: parsedLinks, seoImage: fields.seoImage.trim() || null,
  };
  const afterSave = async (result: PaperData) => {
    await Promise.all([
      client.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }),
      client.invalidateQueries({ queryKey: getListAdminPapersQueryKey() }),
      client.invalidateQueries({ queryKey: getListPublicPapersQueryKey() }),
      client.invalidateQueries({ queryKey: getGetHomePapersQueryKey() }),
      ...(mode === 'edit' ? [client.invalidateQueries({ queryKey: getGetAdminPaperQueryKey(id) })] : []),
    ]);
    setMessage('Saved.'); setErrorMessage('');
    navigate(`/admin/papers/${result.id}/edit`);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault(); setMessage(''); setErrorMessage('');
    if (!payload.title || !payload.slug || !parsedAuthors.length) { setErrorMessage('Title, slug, and at least one author are required.'); return; }
    if (mode === 'create') create.mutate({ data: payload }, { onSuccess: (result) => void afterSave(result as PaperData), onError: (error) => setErrorMessage(queryError(error)) });
    else update.mutate({ id, data: payload }, { onSuccess: (result) => void afterSave(result as PaperData), onError: (error) => setErrorMessage(queryError(error)) });
  };
  const onUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    upload.mutate({ data: { image: file } }, { onSuccess: (result) => { set('seoImage', result.url); setMessage('Image uploaded. Save the paper to keep this image.'); setErrorMessage(''); }, onError: (error) => setErrorMessage(queryError(error)) });
    event.target.value = '';
  };
  const uploadContentImage = (file: File) => new Promise<string>((resolve, reject) => {
    upload.mutate({ data: { image: file } }, {
      onSuccess: (result) => {
        setMessage('Image uploaded. Save the paper to keep it.');
        setErrorMessage('');
        resolve(result.url);
      },
      onError: (error) => {
        const message = queryError(error);
        setErrorMessage(message);
        reject(new Error(message));
      },
    });
  });
  const onDelete = () => {
    if (!window.confirm('Delete this paper permanently? This cannot be undone.')) return;
    remove.mutate({ id }, { onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: getListAdminPapersQueryKey() }),
        client.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }),
        client.invalidateQueries({ queryKey: getListPublicPapersQueryKey() }),
        client.invalidateQueries({ queryKey: getGetHomePapersQueryKey() }),
      ]);
      navigate('/admin');
    }, onError: (error) => setErrorMessage(queryError(error)) });
  };
  if (mode === 'edit' && paper.isLoading) return <AdminFrame><LoadingState label="Opening paper"/></AdminFrame>;
  if (mode === 'edit' && paper.isError) return <AdminFrame><ErrorState error={paper.error} retry={() => void paper.refetch()}/></AdminFrame>;
  const busy = create.isPending || update.isPending || upload.isPending;
  return <AdminFrame>
    <Link className="back-link" href="/admin"><ArrowLeft size={13}/> Back to papers</Link>
    <div className="admin-row"><div><p className="admin-kicker">{mode === 'create' ? 'New manuscript' : 'Editing manuscript'}</p><h1 className="admin-title">{mode === 'create' ? 'Add a paper' : fields.title || 'Edit paper'}</h1></div>{mode === 'edit' && <Link className="button" href={`/admin/papers/${id}/preview`}><Eye size={14}/> Preview</Link>}</div>
    {message && <div className="notice" role="status" style={{ marginBottom: 18 }}>{message}</div>}
    {errorMessage && <div className="notice error" role="alert" style={{ marginBottom: 18 }}>{errorMessage}</div>}
    <form onSubmit={submit} className="form-grid">
      <label className="field"><span className="field-label">Paper title *</span><input className="control" required value={fields.title} onChange={(e) => { const title = e.target.value; set('title', title); if (!slugEdited) set('slug', slugify(title)); }} data-testid="input-paper-title"/></label>
      <label className="field"><span className="field-label">URL slug *</span><input className="control" required value={fields.slug} onChange={(e) => { setSlugEdited(true); set('slug', e.target.value); }} placeholder="paper-title" data-testid="input-paper-slug"/><span className="help-text">Generated from the title until you edit it. Used in the public paper address.</span></label>
      <label className="field"><span className="field-label">Short title</span><input className="control" value={fields.shortTitle} onChange={(e) => set('shortTitle', e.target.value)}/></label>
      <label className="field"><span className="field-label">Venue</span><input className="control" value={fields.venue} onChange={(e) => set('venue', e.target.value)}/></label>
      <label className="field"><span className="field-label">Status</span><input className="control" value={fields.status} onChange={(e) => set('status', e.target.value)} placeholder="Under review"/></label>
      <label className="field"><span className="field-label">Year *</span><input className="control" type="number" required value={fields.year} onChange={(e) => set('year', e.target.value)}/></label>
      <label className="field"><span className="field-label">Submitted date</span><input className="control" type="date" value={fields.submittedDate} onChange={(e) => set('submittedDate', e.target.value)}/></label>
      <label className="field"><span className="field-label">Keywords</span><input className="control" value={fields.keywords} onChange={(e) => set('keywords', e.target.value)} placeholder="world models, safety"/></label>
      <label className="field full"><span className="field-label">Authors * · one per line</span><textarea className="control" value={fields.authors} onChange={(e) => set('authors', e.target.value)} placeholder="Name | Affiliation | Profile URL" data-testid="input-paper-authors"/><span className="help-text">Enter name, affiliation, and profile URL separated by vertical bars. Affiliation and URL are optional.</span></label>
      <label className="field full"><span className="field-label">Research summary</span><textarea className="control" value={fields.summary} onChange={(e) => set('summary', e.target.value)} data-testid="input-paper-summary"/></label>
      <label className="field full"><span className="field-label">Abstract</span><textarea className="control" value={fields.abstract} onChange={(e) => set('abstract', e.target.value)} data-testid="input-paper-abstract"/></label>
      <div className="field full"><span className="field-label">Paper content</span><RichTextEditor value={fields.content} onChange={(html) => set('content', html)} onUploadImage={uploadContentImage} imageUploadPending={upload.isPending}/></div>
      <label className="field full"><span className="field-label">External links · label | URL, one per line</span><textarea className="control" value={fields.externalLinks} onChange={(e) => set('externalLinks', e.target.value)} placeholder="Project page | https://example.org"/></label>
      <div className="field full"><span className="field-label">Social / SEO image</span><div className="button-row"><label className="button" style={{ cursor: 'pointer' }}><Upload size={14}/> Upload image<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onUpload} hidden data-testid="input-image-upload"/></label>{upload.isPending && <span className="help-text">Uploading…</span>}</div>{fields.seoImage && <div><img src={fields.seoImage} alt="Selected social preview" style={{ display: 'block', maxWidth: '100%', maxHeight: 180, marginTop: 12 }}/><button className="button button-quiet" type="button" onClick={() => set('seoImage', '')}>Remove image</button></div>}</div>
      <div className="field full button-row"><label className="check-line"><input type="checkbox" checked={fields.featured} onChange={(e) => set('featured', e.target.checked)}/> Feature on homepage</label><label className="check-line"><input type="checkbox" checked={fields.published} onChange={(e) => set('published', e.target.checked)}/> Published</label></div>
      <div className="field full button-row" style={{ justifyContent: 'space-between', borderTop: '1px solid var(--rule)', paddingTop: 20 }}><div className="button-row"><button className="button button-solid" type="submit" disabled={busy} data-testid="button-save-paper">{busy ? 'Saving…' : mode === 'create' ? 'Create paper' : 'Save changes'}</button><Link href="/admin" className="button">Cancel</Link></div>{mode === 'edit' && <button className="button button-danger" type="button" disabled={remove.isPending} onClick={onDelete} data-testid="button-delete-paper">Delete paper</button>}</div>
    </form>
  </AdminFrame>;
}
function PaperPreview() {
  const { id = '' } = useParams<{ id: string }>();
  const paper = useGetAdminPaper(id, { query: { enabled: Boolean(id), queryKey: getGetAdminPaperQueryKey(id) } });
  if (paper.isLoading) return <AdminFrame><LoadingState label="Loading preview"/></AdminFrame>;
  if (paper.isError || !paper.data) return <AdminFrame><ErrorState error={paper.error} retry={() => void paper.refetch()}/></AdminFrame>;
  const record = paper.data as PaperData;
  return <AdminFrame><Link className="back-link" href={`/admin/papers/${id}/edit`}><ArrowLeft size={13}/> Return to editing</Link>
    <div className="admin-row"><div><p className="admin-kicker">Private preview · not visible to readers</p><h1 className="admin-title">{record.published ? 'Published paper' : 'Draft preview'}</h1></div><Link className="button" href={`/admin/papers/${id}/edit`}>Edit paper</Link></div>
    <div className="preview-frame"><article className="paper-page" style={{ padding: '20px 0 40px' }}>
      {record.seoImage && <img src={record.seoImage} alt="" style={{ width: '100%', marginBottom: 24 }}/>}
      <div className="paper-meta"><span className="paper-status">{record.status || 'Research'}</span>{record.venue && <span>{record.venue}</span>}</div>
      <h2 className="paper-page-title">{record.title}</h2><p className="paper-page-authors">{authorLabel(record.authors)}</p><p className="paper-page-date">{record.year} · {record.published ? 'Published' : 'Draft'}</p>
      {record.abstract && <section className="paper-section" style={{ marginTop: 40 }}><h3 className="paper-section-title">Abstract</h3>{record.abstract.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</section>}
      {record.content && <section className="paper-section prose-editorial" dangerouslySetInnerHTML={{ __html: record.content }}/>}
    </article></div>
  </AdminFrame>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>
    <Switch>
      <Route path="/" component={HomePage}/>
      <Route path="/research" component={ResearchIndex}/>
      <Route path="/research/:slug" component={PublicPaperPage}/>
      <Route path="/admin/login" component={AdminLogin}/>
      
      {/* Paper Routes */}
      <Route path="/admin/papers/new">{() => <SessionGate><PaperEditor mode="create"/></SessionGate>}</Route>
      <Route path="/admin/papers/:id/edit">{() => <SessionGate><PaperEditor mode="edit"/></SessionGate>}</Route>
      <Route path="/admin/papers/:id/preview">{() => <SessionGate><PaperPreview/></SessionGate>}</Route>
      
      {/* Peer Review Routes */}
      <Route path="/admin/reviews/new">{() => <SessionGate><ReviewEditor mode="create"/></SessionGate>}</Route>
      <Route path="/admin/reviews/:id/edit">{() => <SessionGate><ReviewEditor mode="edit"/></SessionGate>}</Route>
      
      <Route path="/admin">{() => <SessionGate><AdminDashboard/></SessionGate>}</Route>
      <Route component={NotFound}/>
    </Switch>
  </ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><Router/><Toaster/></TooltipProvider></QueryClientProvider>;
}
export default App;
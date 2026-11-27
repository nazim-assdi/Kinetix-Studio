import React, { useEffect, useMemo, useState } from 'react';
import { FolderOpen, FileVideo, Plus, Search, Trash2, X, Save, RefreshCw } from 'lucide-react';
import { deleteNamedProject, listSavedProjects, ProjectLibraryEntry } from '../engine/projectStorage';

interface ProjectManagerModalProps {
  isOpen: boolean;
  currentProjectId: string | null;
  currentProjectName: string;
  onClose: () => void;
  onNewProject: () => void;
  onSaveAs: (name: string, folder: string) => Promise<void>;
  onOpenProject: (id: string) => Promise<void>;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  currentProjectId,
  currentProjectName,
  onClose,
  onNewProject,
  onSaveAs,
  onOpenProject,
}) => {
  const [projects, setProjects] = useState<ProjectLibraryEntry[]>([]);
  const [query, setQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState('All Folders');
  const [name, setName] = useState(currentProjectName || 'Untitled Project');
  const [folder, setFolder] = useState('My Projects');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    try {
      setProjects(await listSavedProjects());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the project library.');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setName(currentProjectName || 'Untitled Project');
      void refresh();
    }
  }, [isOpen, currentProjectName]);

  const folders = useMemo(() => ['All Folders', ...new Set(projects.map((project) => project.folder || 'My Projects'))], [projects]);
  const filtered = useMemo(() => projects.filter((project) =>
    (folderFilter === 'All Folders' || (project.folder || 'My Projects') === folderFilter) &&
    (!query.trim() || project.name.toLowerCase().includes(query.trim().toLowerCase()) || project.compositionName.toLowerCase().includes(query.trim().toLowerCase()))
  ), [projects, folderFilter, query]);

  if (!isOpen) return null;

  const openProject = async (id: string) => {
    setBusyId(id);
    try {
      await onOpenProject(id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open project.');
    } finally {
      setBusyId(null);
    }
  };

  const removeProject = async (id: string) => {
    if (!window.confirm('Delete this saved project from the Project Library?')) return;
    setBusyId(id);
    try {
      await deleteNamedProject(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete project.');
    } finally {
      setBusyId(null);
    }
  };

  const saveAs = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      await onSaveAs(name.trim(), folder.trim() || 'My Projects');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save project.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 flex items-center justify-center p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="project-manager-title" className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-xl border border-[#303744] bg-[#181A1F] shadow-2xl overflow-hidden">
        <header className="flex items-center justify-between px-5 py-4 border-b border-[#2B303A]">
          <div><h2 id="project-manager-title" className="text-base font-semibold text-white">Project Manager</h2><p className="text-[11px] text-[#8D95A5] mt-0.5">Manage projects and virtual folders stored on this device</p></div>
          <button type="button" onClick={onClose} aria-label="Close Project Manager" className="p-2 rounded hover:bg-[#2B303A] text-[#AAB2C0]"><X className="w-4 h-4" /></button>
        </header>
        <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)] min-h-0 flex-1">
          <div className="p-4 min-h-0 flex flex-col border-r border-[#2B303A]">
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1"><Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-[#697386]" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search projects..." className="w-full bg-[#0E1013] border border-[#303744] rounded pl-8 pr-3 py-2 text-xs text-white outline-none focus:border-[#3B82F6]" /></div>
              <select value={folderFilter} onChange={(e) => setFolderFilter(e.target.value)} className="max-w-40 bg-[#0E1013] border border-[#303744] rounded px-2 py-2 text-xs text-white">{folders.map((value) => <option key={value}>{value}</option>)}</select>
              <button type="button" onClick={() => void refresh()} title="Refresh library" className="p-2 rounded bg-[#232730] hover:bg-[#303744]"><RefreshCw className="w-3.5 h-3.5" /></button>
            </div>
            <div className="flex-1 overflow-auto space-y-2">
              {filtered.length === 0 ? <div className="py-12 text-center text-xs text-[#758094]"><FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />No saved projects in this folder</div> : filtered.map((project) => (
                <div key={project.id} className={`flex items-center gap-3 border rounded-lg p-3 ${currentProjectId === project.id ? 'border-[#3B82F6] bg-[#18263C]' : 'border-[#2B303A] bg-[#111318]'}`}>
                  <div className="w-10 h-10 rounded bg-[#202A39] flex items-center justify-center text-[#60A5FA]"><FileVideo className="w-5 h-5" /></div>
                  <div className="min-w-0 flex-1"><div className="text-xs font-semibold text-white truncate">{project.name}</div><div className="text-[10px] text-[#8D95A5] truncate">{project.folder || 'My Projects'} · {project.clipCount} layers · {new Date(project.savedAt).toLocaleString()}</div></div>
                  <button type="button" disabled={busyId === project.id} onClick={() => void openProject(project.id)} className="px-3 py-1.5 rounded bg-[#2563EB] hover:bg-[#1D4ED8] text-[10px] font-semibold text-white disabled:opacity-50">{busyId === project.id ? 'Opening…' : 'Open'}</button>
                  <button type="button" disabled={busyId === project.id} onClick={() => void removeProject(project.id)} aria-label={`Delete ${project.name}`} className="p-2 rounded text-[#9BA1AD] hover:text-red-400 hover:bg-[#302126]"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="p-5 space-y-4">
            <button type="button" onClick={() => { onNewProject(); onClose(); }} className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[#202B3C] hover:bg-[#2A3A52] border border-[#334B6D] text-xs font-semibold text-[#BFDBFE]"><Plus className="w-4 h-4" />New Empty Project</button>
            <div className="border-t border-[#2B303A] pt-4 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-white"><Save className="w-3.5 h-3.5 text-[#5EEAD4]" />Save Current As</div>
              <label className="block text-[10px] text-[#8D95A5]">Project Name<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full bg-[#0E1013] border border-[#303744] rounded px-2.5 py-2 text-xs text-white outline-none focus:border-[#3B82F6]" /></label>
              <label className="block text-[10px] text-[#8D95A5]">Project Folder<input value={folder} onChange={(e) => setFolder(e.target.value)} list="kinetix-project-folders" placeholder="My Projects" className="mt-1 w-full bg-[#0E1013] border border-[#303744] rounded px-2.5 py-2 text-xs text-white outline-none focus:border-[#3B82F6]" /><datalist id="kinetix-project-folders">{folders.filter((item) => item !== 'All Folders').map((item) => <option key={item} value={item} />)}</datalist></label>
              <button type="button" disabled={!name.trim() || saving} onClick={() => void saveAs()} className="w-full py-2.5 rounded bg-[#0F766E] hover:bg-[#0D9488] text-xs font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save as Project'}</button>
            </div>
            {error && <p role="alert" className="text-[10px] text-red-300">{error}</p>}
            <p className="text-[10px] leading-relaxed text-[#687386]">Project folders are virtual folders inside the local project library. Imported media remains embedded with the saved project.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

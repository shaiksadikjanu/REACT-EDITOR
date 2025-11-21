import React, { useState, useEffect, useCallback } from 'react';
import { 
  Play, 
  Save, 
  Layout, 
  FileCode, 
  FileType, 
  Trash2, 
  Plus, 
  Menu, 
  X,
  Code2,
  Atom,
  Loader2,
  RefreshCw,
  Maximize2,
  Minimize2,
  Zap,
  ZapOff,
  Box,
  File
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';

// --- Firebase Initialization ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// --- Default Templates ---

const DEFAULT_FILES = {
  'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,

  'index.jsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`,

  'App.jsx': `import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="container">
      <div className="card">
        <div className="icon-wrapper">
          <i className="fa-brands fa-react"></i>
        </div>
        <h1>Runtime Ready</h1>
        <p>This editor now handles exports better!</p>
        
        <button 
          onClick={() => setCount(c => c + 1)}
          className="btn"
        >
          Count is {count}
        </button>
      </div>
    </div>
  );
}`,

  'App.css': `body {
  font-family: 'Inter', sans-serif;
  background-color: #f3f4f6;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  margin: 0;
}

.container {
  text-align: center;
}

.card {
  background: white;
  padding: 2rem 3rem;
  border-radius: 1rem;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
}

.icon-wrapper {
  font-size: 3rem;
  color: #61dafb;
  margin-bottom: 1rem;
  animation: spin 10s linear infinite;
}

h1 {
  color: #1f2937;
  margin-bottom: 0.5rem;
}

p {
  color: #6b7280;
  margin-bottom: 1.5rem;
}

.btn {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
}

.btn:hover {
  background: #2563eb;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}`,

  'package.json': `{
  "name": "react-project",
  "version": "1.0.0",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "canvas-confetti": "^1.6.0"
  }
}`
};

// --- Main Component ---
export default function ReactRunner() {
  // User State
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Editor State
  const [files, setFiles] = useState(DEFAULT_FILES);
  const [activeFile, setActiveFile] = useState('App.jsx');
  const [srcDoc, setSrcDoc] = useState('');
  const [projectTitle, setProjectTitle] = useState('My React Project');
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [key, setKey] = useState(0); 
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isAutoRun, setIsAutoRun] = useState(true);

  // UI State
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // --- Auth & Data Loading ---
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // Load Projects
  useEffect(() => {
    if (!user) return;

    const projectsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'react_projects');
    const q = query(projectsRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedProjects = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      loadedProjects.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setProjects(loadedProjects);
      setLoadingProjects(false);
    });

    return () => unsubscribe();
  }, [user]);

  // --- Helper: Dependency Parser ---
  const getExternalScripts = (packageJsonStr) => {
    const scripts = [];
    try {
      const pkg = JSON.parse(packageJsonStr);
      if (pkg.dependencies) {
        Object.keys(pkg.dependencies).forEach(dep => {
          if (dep !== 'react' && dep !== 'react-dom') {
            scripts.push(`<script src="https://unpkg.com/${dep}"></script>`);
          }
        });
      }
    } catch (e) {
      console.warn("Invalid package.json", e);
    }
    return scripts.join('\n');
  };

  // --- Compilation Logic ---
  const runPreview = useCallback(() => {
    
    // 1. Process App.jsx
    let processedApp = files['App.jsx'];
    
    // Clean Imports (Handle multiline, optional semicolon, ' or " quotes)
    processedApp = processedApp.replace(/^import\s+React[\s\S]*?from\s+['"]react['"];?/gm, '');
    processedApp = processedApp.replace(/^import\s+[\s\S]*?from\s+['"]react['"];?/gm, '');

    // Robust Export Default Handling
    // Replaces "export default ..." with "window.App = ..."
    if (processedApp.includes('export default')) {
       processedApp = processedApp.replace(/export\s+default\s+/, 'window.App = ');
    } else {
       // Fallback: If they just defined "function App", try to assign it to window
       processedApp += '\nif (typeof App !== "undefined" && !window.App) { window.App = App; }';
    }

    // 2. Process index.jsx
    let processedIndex = files['index.jsx'];
    // Clean imports
    processedIndex = processedIndex.replace(/^import\s+React[\s\S]*?from\s+['"]react['"];?/gm, '');
    processedIndex = processedIndex.replace(/^import\s+ReactDOM[\s\S]*?from\s+['"]react-dom\/client['"];?/gm, '');
    processedIndex = processedIndex.replace(/^import\s+ReactDOM[\s\S]*?from\s+['"]react-dom['"];?/gm, '');
    processedIndex = processedIndex.replace(/^import\s+App[\s\S]*?from\s+['"]\.\/App['"];?/gm, '');
    
    // 3. Dependencies
    const dependencyScripts = getExternalScripts(files['package.json']);

    // 4. HTML Injection
    let htmlContent = files['index.html'];
    
    const scriptsToInject = `
    <!-- Core Libraries -->
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    
    <!-- User Dependencies -->
    ${dependencyScripts}

    <style>
      ${files['App.css']}
      #error-display {
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(255, 255, 255, 0.95);
        color: #ef4444;
        padding: 2rem;
        z-index: 9999;
        font-family: monospace;
        white-space: pre-wrap;
        overflow: auto;
      }
    </style>

    <div id="error-display"></div>
    <script>
      // Enhanced Error Logging
      window.onerror = function(message, source, lineno, colno, error) {
        const el = document.getElementById('error-display');
        el.style.display = 'block';
        let msg = message;
        if (error && error.message) msg = error.message;
        el.innerHTML = '<strong>Runtime Error:</strong><br/>' + msg + '<br/><br/><small>' + (source || 'Inline Script') + ':' + lineno + '</small>';
      };
      
      // Console Error Capture
      const originalConsoleError = console.error;
      console.error = function(...args) {
        originalConsoleError.apply(console, args);
        // Optional: show console errors in overlay? 
        // For now, we rely on window.onerror for crashes.
      };
    </script>

    <!-- App Execution -->
    <script type="text/babel" data-presets="env,react">
      // Polyfill Module System to prevent crashes if Babel transpiles to exports
      var exports = {};
      var module = { exports: exports };
      
      // Expose React Globals
      const { useState, useEffect, useMemo, useCallback, useRef, useReducer, useContext, createContext } = React;
      
      try {
        // --- 1. App.jsx Code ---
        ${processedApp}

        // Handle case where Babel used module.exports instead of our window.App replacement
        if (!window.App && module.exports.default) window.App = module.exports.default;
        if (!window.App && module.exports && typeof module.exports === 'function') window.App = module.exports;

        // --- 2. index.jsx Code ---
        ${processedIndex}
        
      } catch (err) {
        const el = document.getElementById('error-display');
        el.style.display = 'block';
        el.innerText = 'Compilation/Execution Error:\\n' + err.message + '\\n' + (err.stack || '');
      }
    </script>
    `;

    if (htmlContent.includes('</body>')) {
      htmlContent = htmlContent.replace('</body>', `${scriptsToInject}</body>`);
    } else {
      htmlContent += scriptsToInject;
    }

    setSrcDoc(htmlContent);
    setKey(k => k + 1);
  }, [files]);

  // --- Auto-Run ---
  useEffect(() => {
    if (!isAutoRun) return;
    const timeoutId = setTimeout(() => runPreview(), 1500); // Increased debounce slightly
    return () => clearTimeout(timeoutId);
  }, [files, isAutoRun, runPreview]);

  // Initial Run
  useEffect(() => {
    runPreview();
  }, []);

  // --- Actions ---
  const handleFileChange = (val) => {
    setFiles(prev => ({
      ...prev,
      [activeFile]: val
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    setIsSaving(true);

    const projectData = {
      title: projectTitle,
      files: files, 
      updatedAt: serverTimestamp()
    };

    try {
      if (currentProjectId) {
        await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'react_projects', currentProjectId), projectData);
      } else {
        const colRef = collection(db, 'artifacts', appId, 'users', user.uid, 'react_projects');
        const docRef = await addDoc(colRef, {
          ...projectData,
          createdAt: serverTimestamp()
        });
        setCurrentProjectId(docRef.id);
      }
    } catch (error) {
      console.error("Error saving:", error);
      alert("Save failed");
    } finally {
      setIsSaving(false);
    }
  };

  const loadProject = (project) => {
    if (project.files) {
      setFiles(project.files);
    } else {
      setFiles({
        ...DEFAULT_FILES,
        'App.jsx': project.jsx || DEFAULT_FILES['App.jsx'],
        'App.css': project.css || DEFAULT_FILES['App.css']
      });
    }
    setProjectTitle(project.title || 'Untitled');
    setCurrentProjectId(project.id);
    setSidebarOpen(false);
    setActiveFile('App.jsx');
    setTimeout(() => setKey(k => k + 1), 50); 
  };

  const createNewProject = () => {
    setFiles(DEFAULT_FILES);
    setProjectTitle('New Project');
    setCurrentProjectId(null);
    setActiveFile('App.jsx');
    setSidebarOpen(false);
    setTimeout(() => setKey(k => k + 1), 50);
  };

  const deleteProject = async (e, id) => {
    e.stopPropagation();
    if (!confirm("Delete this project?")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'react_projects', id));
      if (currentProjectId === id) createNewProject();
    } catch (err) {
      console.error(err);
    }
  };

  const getIconForFile = (filename) => {
    if (filename.endsWith('html')) return <Layout className="w-3 h-3 text-orange-400" />;
    if (filename.endsWith('css')) return <FileType className="w-3 h-3 text-blue-400" />;
    if (filename.endsWith('jsx')) return <Atom className="w-3 h-3 text-cyan-400" />;
    if (filename.endsWith('json')) return <Box className="w-3 h-3 text-yellow-400" />;
    return <File className="w-3 h-3" />;
  };

  return (
    <div className="flex h-screen bg-[#1e1e1e] text-gray-300 font-sans overflow-hidden">
      
      {/* --- Sidebar --- */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-[#252526] border-r border-[#333] transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0
      `}>
        <div className="p-4 border-b border-[#333] flex justify-between items-center">
          <h2 className="font-bold text-sm text-white flex items-center gap-2">
            <Atom className="w-4 h-4 text-[#61dafb]" />
            REACT STUDIO
          </h2>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3">
          <button 
            onClick={createNewProject}
            className="w-full flex items-center justify-center gap-2 bg-[#007fd4] hover:bg-[#026ec1] text-white py-1.5 px-3 rounded text-xs font-medium transition-colors"
          >
            <Plus className="w-3 h-3" /> New Project
          </button>
        </div>

        <div className="overflow-y-auto h-[calc(100vh-120px)] px-2 space-y-0.5">
          {loadingProjects ? (
            <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin" /></div>
          ) : projects.length === 0 ? (
            <div className="text-center p-4 text-xs text-gray-500">No saved projects.</div>
          ) : (
            projects.map(proj => (
              <div 
                key={proj.id}
                onClick={() => loadProject(proj)}
                className={`group flex items-center justify-between p-2 rounded cursor-pointer text-xs ${currentProjectId === proj.id ? 'bg-[#37373d] text-white' : 'hover:bg-[#2a2d2e]'}`}
              >
                <span className="truncate flex-1">{proj.title}</span>
                <button 
                  onClick={(e) => deleteProject(e, proj.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* --- Main Area --- */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Toolbar */}
        <header className="h-12 bg-[#1e1e1e] border-b border-[#333] flex items-center justify-between px-4 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden text-gray-400">
              <Menu className="w-5 h-5" />
            </button>
            <input 
              type="text" 
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              className="bg-transparent border border-transparent hover:border-[#444] focus:border-[#007fd4] focus:bg-[#252526] rounded px-2 py-1 text-sm text-white focus:outline-none transition-colors w-48"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsAutoRun(!isAutoRun)}
              className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium transition-colors ${isAutoRun ? 'text-yellow-400 bg-[#2d2d2d] border border-[#444]' : 'text-gray-500 hover:text-gray-300'}`}
            >
              {isAutoRun ? <Zap className="w-3 h-3 fill-current" /> : <ZapOff className="w-3 h-3" />}
              <span className="hidden sm:inline">{isAutoRun ? 'Auto' : 'Manual'}</span>
            </button>

            <div className="h-4 w-px bg-[#333] mx-1"></div>

            <button 
              onClick={runPreview}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#2d2d2d] hover:bg-[#383838] text-green-500 rounded text-xs font-medium transition-colors"
            >
              <Play className="w-3 h-3 fill-current" />
              <span className="hidden sm:inline">Run</span>
            </button>
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-2 px-3 py-1.5 bg-[#007fd4] hover:bg-[#026ec1] text-white rounded text-xs font-medium transition-colors"
            >
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              <span className="hidden sm:inline">Save</span>
            </button>
          </div>
        </header>

        {/* Split View */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          
          {/* Editor */}
          <div className={`flex-col min-h-[400px] lg:min-h-0 border-r border-[#333] ${isFullScreen ? 'hidden' : 'flex-1 flex'}`}>
            
            {/* File Tabs */}
            <div className="flex bg-[#1e1e1e] overflow-x-auto scrollbar-hide">
              {Object.keys(files).map(fileName => (
                <button 
                  key={fileName}
                  onClick={() => setActiveFile(fileName)}
                  className={`flex items-center gap-2 px-4 py-2 text-xs border-t-2 whitespace-nowrap transition-colors ${activeFile === fileName ? 'bg-[#1e1e1e] text-white border-[#007fd4]' : 'bg-[#2d2d2d] text-gray-500 border-transparent hover:bg-[#252526]'}`}
                >
                  {getIconForFile(fileName)} {fileName}
                </button>
              ))}
            </div>

            <div className="flex-1 relative group bg-[#1e1e1e]">
              <textarea
                value={files[activeFile]}
                onChange={(e) => handleFileChange(e.target.value)}
                spellCheck="false"
                className="w-full h-full p-4 bg-[#1e1e1e] text-gray-300 font-mono text-sm resize-none focus:outline-none leading-relaxed custom-scrollbar"
              />
            </div>
          </div>

          {/* Preview */}
          <div className={`flex-col bg-white border-l border-[#333] ${isFullScreen ? 'flex-1 flex' : 'flex-1 flex'}`}>
             <div className="h-8 bg-[#f3f4f6] border-b border-gray-200 flex items-center justify-between px-3">
                <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                   <Layout className="w-3 h-3" /> Browser Preview
                </span>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsFullScreen(!isFullScreen)} 
                    className="text-gray-400 hover:text-gray-600" 
                    title={isFullScreen ? "Exit Full Screen" : "Full Screen"}
                  >
                    {isFullScreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                  </button>
                  <button onClick={() => setKey(k => k + 1)} className="text-gray-400 hover:text-gray-600" title="Refresh Preview">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
             </div>
             <div className="flex-1 relative bg-white">
                <iframe
                  key={key}
                  srcDoc={srcDoc}
                  title="react-output"
                  sandbox="allow-scripts allow-modals allow-same-origin"
                  className="w-full h-full absolute inset-0 border-none"
                />
                {!srcDoc && (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-300">
                    Loading Environment...
                  </div>
                )}
             </div>
          </div>
        </div>
      </div>
      
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #1e1e1e; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #424242; border-radius: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #4f4f4f; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
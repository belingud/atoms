import { WebContainer } from '@webcontainer/api'

let webcontainerInstance: WebContainer | null = null
let bootPromise: Promise<WebContainer> | null = null

export async function getWebContainer(): Promise<WebContainer> {
  // Return existing instance if available
  if (webcontainerInstance) {
    return webcontainerInstance
  }

  // Wait for existing boot process if in progress
  if (bootPromise) {
    return bootPromise
  }

  // Boot new instance
  bootPromise = WebContainer.boot()
  webcontainerInstance = await bootPromise
  bootPromise = null

  return webcontainerInstance
}

export async function teardownWebContainer(): Promise<void> {
  if (webcontainerInstance) {
    webcontainerInstance.teardown()
    webcontainerInstance = null
  }
}

export function isWebContainerSupported(): boolean {
  // Check for SharedArrayBuffer support
  return typeof SharedArrayBuffer !== 'undefined'
}

export interface FileSystemTree {
  [name: string]: FileNode | DirectoryNode
}

interface FileNode {
  file: {
    contents: string
  }
}

interface DirectoryNode {
  directory: FileSystemTree
}

// Normalize path: remove leading slashes, handle empty parts
function normalizePath(path: string): string {
  return path
    .replace(/^\/+/, '') // Remove leading slashes
    .replace(/\/+/g, '/') // Replace multiple slashes with single
    .trim()
}

// Convert flat file list to WebContainer file system tree
export function filesToFileSystemTree(
  files: { path: string; content: string }[]
): FileSystemTree {
  const tree: FileSystemTree = {}

  for (const file of files) {
    // Normalize the path
    const normalizedPath = normalizePath(file.path)
    if (!normalizedPath) continue // Skip empty paths

    const parts = normalizedPath.split('/').filter(Boolean) // Filter out empty parts
    if (parts.length === 0) continue

    let current = tree

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1

      if (isLast) {
        // File node
        current[part] = {
          file: {
            contents: file.content,
          },
        }
      } else {
        // Directory node
        if (!current[part]) {
          current[part] = {
            directory: {},
          }
        }
        const node = current[part]
        if ('directory' in node) {
          current = node.directory
        }
      }
    }
  }

  return tree
}

// Find user's entry point component in the tree
function findUserEntryPoint(tree: FileSystemTree): { path: string; importPath: string } | null {
  // Check for common entry point patterns
  const patterns = [
    // src/App.tsx, src/App.jsx, src/App.js
    { dir: 'src', files: ['App.tsx', 'App.jsx', 'App.js'], importPath: './App' },
    // src/app.tsx, src/app.jsx (lowercase)
    { dir: 'src', files: ['app.tsx', 'app.jsx', 'app.js'], importPath: './app' },
    // src/index.tsx (some projects use this)
    { dir: 'src', files: ['index.tsx', 'index.jsx'], importPath: './index' },
    // Root level App files
    { dir: null, files: ['App.tsx', 'App.jsx', 'App.js'], importPath: '../App' },
  ]

  for (const pattern of patterns) {
    if (pattern.dir) {
      const dirNode = tree[pattern.dir]
      if (dirNode && 'directory' in dirNode) {
        for (const file of pattern.files) {
          if (dirNode.directory[file] && 'file' in dirNode.directory[file]) {
            return { path: `${pattern.dir}/${file}`, importPath: pattern.importPath }
          }
        }
      }
    } else {
      for (const file of pattern.files) {
        if (tree[file] && 'file' in tree[file]) {
          return { path: file, importPath: pattern.importPath }
        }
      }
    }
  }

  // Check for any .tsx/.jsx file in src that could be a component
  const srcNode = tree['src']
  if (srcNode && 'directory' in srcNode) {
    for (const [name, node] of Object.entries(srcNode.directory)) {
      if ('file' in node && (name.endsWith('.tsx') || name.endsWith('.jsx'))) {
        // Skip main.tsx and index.tsx as they're usually entry points, not components
        if (name !== 'main.tsx' && name !== 'index.tsx') {
          const baseName = name.replace(/\.(tsx|jsx)$/, '')
          return { path: `src/${name}`, importPath: `./${baseName}` }
        }
      }
    }
  }

  return null
}

// Create a basic package.json if not provided
export function ensurePackageJson(
  tree: FileSystemTree,
  projectName: string = 'my-app'
): FileSystemTree {
  // Find user's entry point first
  const userEntryPoint = findUserEntryPoint(tree)

  if (!tree['package.json']) {
    tree['package.json'] = {
      file: {
        contents: JSON.stringify(
          {
            name: projectName,
            version: '1.0.0',
            type: 'module',
            scripts: {
              dev: 'vite',
            },
            dependencies: {
              react: '^18.2.0',
              'react-dom': '^18.2.0',
            },
            devDependencies: {
              '@vitejs/plugin-react': '^4.0.0',
              vite: '^5.0.0',
            },
          },
          null,
          2
        ),
      },
    }
  }

  // Ensure vite.config.js exists
  if (!tree['vite.config.js']) {
    tree['vite.config.js'] = {
      file: {
        contents: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
`,
      },
    }
  }

  // Ensure index.html exists
  if (!tree['index.html']) {
    tree['index.html'] = {
      file: {
        contents: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
      },
    }
  }

  // Ensure src directory exists
  if (!tree['src']) {
    tree['src'] = { directory: {} }
  }
  const srcDir = (tree['src'] as DirectoryNode).directory

  // Determine import path for main.tsx
  const importPath = userEntryPoint?.importPath || './App'

  // Only create main.tsx if it doesn't exist
  if (!srcDir['main.tsx']) {
    srcDir['main.tsx'] = {
      file: {
        contents: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '${importPath}'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,
      },
    }
  }

  // Only create default App.tsx if user has NO entry point at all
  if (!userEntryPoint && !srcDir['App.tsx']) {
    srcDir['App.tsx'] = {
      file: {
        contents: `export default function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Hello from WebContainer!</h1>
      <p>Your app is running.</p>
    </div>
  )
}
`,
      },
    }
  }

  return tree
}

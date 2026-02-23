import {
  Header,
  Page,
  Content,
  MarkdownContent,
} from '@backstage/core-components';

const gettingStartedContent = `
## Overview

MISO is a private package registry for C++ Conan packages, built on Backstage. It lets you upload, browse, download, and manage Conan 2 binary packages through a web interface and CLI tool.

Each uploaded package is automatically registered in the Backstage catalog as a Component entity, making it discoverable alongside your other software.

---

## Prerequisites

- **Python 3.6+** with \`pip\`
- **Conan 2.x** installed and configured (\`pip install conan\`)
- **A Conan profile** — run \`conan profile detect\` to create a default one
- **Packages in your Conan cache** — built with \`conan create\` or \`conan install --build=missing\`

---

## CLI Installation

The MISO CLI is a single Python script. Copy it to your system or install the dependencies:

\`\`\`bash
# Install required Python packages
pip install requests

# Make the script executable (Linux/macOS)
chmod +x miso.py

# Or run it directly with Python
python miso.py --help
\`\`\`

---

## Configuration

By default, the CLI connects to \`http://localhost:7007\`. To point it at a different server:

\`\`\`bash
python miso.py --server https://your-server.example.com upload ...
\`\`\`

---

## Uploading Packages

Upload a single package (requires a Conan profile):

\`\`\`bash
# Upload a specific package
python miso.py upload boost/1.81.0 -pr default

# Upload with all dependencies
python miso.py upload mylib/1.0.0 -pr default --with-dependencies

# Force re-upload (overwrites existing data)
python miso.py upload mylib/1.0.0 -pr default --force

# Skip Rust crate generation
python miso.py upload mylib/1.0.0 -pr default --no-rust
\`\`\`

### What gets uploaded

For each package, the CLI uploads:
- **Recipe** — the \`conanfile.py\`
- **Binary** — a \`.tar.gz\` of the package output (headers, libraries, etc.)
- **Dependency graph** — the Conan dependency tree (stored for browsing)
- **README** — if found in the package source directory
- **Rust crate** — an auto-generated \`-sys\` crate wrapping the C++ library (unless \`--no-rust\`)

### Package metadata

Metadata is automatically extracted from \`conanfile.py\` during upload:
- Name, version, description
- Author, license, homepage
- Topics/tags
- Dependencies (from the Conan graph)

---

## Browsing Packages

### Catalog Page

The **Packages** page (\`/catalog\`) shows all registered packages as Backstage catalog entities. You can filter by:
- **Type** — all packages are type \`conan-package\`
- **Tags** — from topics declared in \`conanfile.py\`
- **Owner** — from the author field

Click on any package to view its detail page.

### Package Detail Page

Each package has a **Registry** tab showing:
- **Package Info** — description, author, license, homepage, topics
- **Security & Integrity** — upload provenance, binary SHA256 checksums
- **README** — rendered markdown (if uploaded)
- **Dependencies** — runtime and build dependencies with links to their catalog pages
- **Binaries** — table of available builds (OS, arch, compiler, build type) with download links
- **Recipe** — the full \`conanfile.py\` source

Use the **version selector** dropdown to switch between different versions of a package.

---

## Downloading Packages

### From the Web UI

On the Registry tab, each binary has a **Download** button that downloads the \`.tar.gz\` file directly.

### From the CLI

\`\`\`bash
# Download a package and its dependencies as a ZIP bundle
python miso.py download mylib/1.0.0 -pr default

# Download to a specific directory
python miso.py download mylib/1.0.0 -pr default -o ./my_packages

# Download Rust crates instead of Conan packages
python miso.py download mylib/1.0.0 -pr default --crates
\`\`\`

---

## Deleting Packages

The web UI provides delete functionality on the Registry tab:

- **Delete a single version** — click the trash icon next to the version selector
- **Delete all versions** — click the "Delete All Versions" button

Deletions are immediate and trigger a catalog refresh so the entity is removed.

---

## Generating Rust Crates

MISO can auto-generate Rust \`-sys\` crates that wrap C++ libraries:

\`\`\`bash
python miso.py generate-rust-crate mylib/1.0.0 -pr default
python miso.py generate-rust-crate mylib/1.0.0 -pr default -o ./rust_crates
\`\`\`

The generated crate includes a \`build.rs\` that links against the C++ library and exposes it for Rust FFI.

---

## CLI Reference

| Command | Description |
|---------|-------------|
| \`upload <ref> -pr <profile>\` | Upload a package to the registry |
| \`upload <ref> -pr <profile> --with-dependencies\` | Upload package and all its dependencies |
| \`upload <ref> -pr <profile> --force\` | Force re-upload, overwriting existing data |
| \`upload <ref> -pr <profile> --no-rust\` | Upload without generating a Rust crate |
| \`download <ref> -pr <profile>\` | Download package + dependencies as ZIP |
| \`download <ref> -pr <profile> --crates\` | Download Rust crates instead |
| \`generate-rust-crate <ref> -pr <profile>\` | Generate a Rust \`-sys\` crate locally |

### Global options

| Option | Description |
|--------|-------------|
| \`--server <url>\` | Server URL (default: \`http://localhost:7007\`) |
`;

export const GettingStartedPage = () => {
  return (
    <Page themeId="documentation">
      <Header
        title="Getting Started"
        subtitle="How to use MISO"
      />
      <Content>
        <MarkdownContent content={gettingStartedContent} dialect="gfm" />
      </Content>
    </Page>
  );
};

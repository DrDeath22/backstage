import React, { useState, useCallback } from 'react';
import { useAsync } from 'react-use';
import {
  Typography,
  Grid,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Chip,
  Box,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Link as MuiLink,
  makeStyles,
  createStyles,
  Theme,
} from '@material-ui/core';
import {
  GetApp as DownloadIcon,
  ExpandMore as ExpandMoreIcon,
  Code as CodeIcon,
  Person as PersonIcon,
  Link as LinkIcon,
  Security as SecurityIcon,
  Delete as DeleteIcon,
} from '@material-ui/icons';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
  CodeSnippet,
  MarkdownContent,
  StatusOK,
  StatusWarning,
  StatusError,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { conancratesApiRef } from '../api/ConancratesClient';
import { PackageVersion, BinaryPackage, Dependency, SecurityNote, GraphNode, GraphEdge } from '../api/types';

const useStyles = makeStyles((theme: Theme) =>
  createStyles({
    topicChip: {
      margin: theme.spacing(0.25),
    },
    metaRow: {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap' as const,
    },
    metaItem: {
      display: 'flex',
      alignItems: 'center',
      marginRight: theme.spacing(3),
      marginBottom: theme.spacing(0.5),
    },
    metaIcon: {
      color: theme.palette.text.secondary,
      fontSize: '1.1rem',
      marginRight: theme.spacing(0.5),
    },
    metaLabel: {
      color: theme.palette.text.secondary,
      marginRight: theme.spacing(0.5),
    },
    sha256: {
      fontFamily: 'monospace',
      fontSize: '0.75rem',
      wordBreak: 'break-all' as const,
      backgroundColor: theme.palette.background.default,
      padding: theme.spacing(0.5, 1),
      borderRadius: 4,
    },
    checksumRow: {
      marginBottom: theme.spacing(1),
    },
    severityCritical: { color: theme.palette.error.main, fontWeight: 'bold' as const },
    severityHigh: { color: theme.palette.error.light },
    severityMedium: { color: theme.palette.warning.main },
    severityLow: { color: theme.palette.text.secondary },
    cveRow: {
      display: 'flex',
      alignItems: 'center',
      marginBottom: theme.spacing(0.5),
    },
    cveStatus: {
      marginRight: theme.spacing(1),
    },
    cveId: {
      marginRight: theme.spacing(1),
      fontFamily: 'monospace',
    },
    readmeContainer: {
      maxHeight: 560,
      overflowY: 'auto' as const,
    },
    depChip: {
      marginRight: theme.spacing(0.5),
      marginBottom: theme.spacing(0.5),
    },
    depRow: {
      display: 'flex',
      alignItems: 'center',
      flexWrap: 'wrap' as const,
      marginBottom: theme.spacing(0.5),
    },
    graphSvg: {
      width: '100%',
      overflowX: 'auto' as const,
      display: 'block',
    },
    graphScrollWrapper: {
      overflowX: 'auto' as const,
      overflowY: 'auto' as const,
      maxHeight: 420,
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: 4,
      marginBottom: theme.spacing(2),
      backgroundColor: theme.palette.background.default,
    },
    versionHeader: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap' as const,
    },
  }),
);

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// --- PackageHeader ---

function PackageHeader({ version }: { version: PackageVersion }) {
  const classes = useStyles();
  const topics = version.topics ? version.topics.split(',').filter(Boolean) : [];

  return (
    <InfoCard title="Package Information">
      <Grid container spacing={2}>
        {version.description && (
          <Grid item xs={12}>
            <Typography variant="body1">{version.description}</Typography>
          </Grid>
        )}

        <Grid item xs={12}>
          <div className={classes.metaRow}>
            {(version.author || version.uploaded_by) && (
              <div className={classes.metaItem}>
                <PersonIcon className={classes.metaIcon} />
                <Typography variant="body2" className={classes.metaLabel}>
                  Author:
                </Typography>
                <Typography variant="body2">
                  {version.author || version.uploaded_by}
                </Typography>
              </div>
            )}

            <div className={classes.metaItem}>
              <SecurityIcon className={classes.metaIcon} />
              <Typography variant="body2" className={classes.metaLabel}>
                License:
              </Typography>
              <Chip
                label={version.license || 'Unknown'}
                size="small"
                variant="outlined"
              />
            </div>

            {version.homepage && (
              <div className={classes.metaItem}>
                <LinkIcon className={classes.metaIcon} />
                <Typography variant="body2" className={classes.metaLabel}>
                  Homepage:
                </Typography>
                <MuiLink href={version.homepage} target="_blank" rel="noopener">
                  {version.homepage}
                </MuiLink>
              </div>
            )}
          </div>
        </Grid>

        {topics.length > 0 && (
          <Grid item xs={12}>
            {topics.map(topic => (
              <Chip
                key={topic}
                label={topic.trim()}
                size="small"
                className={classes.topicChip}
                color="primary"
                variant="outlined"
              />
            ))}
          </Grid>
        )}

        <Grid item xs={12} md={4}>
          <Typography variant="body2" color="textSecondary">
            Conan Version
          </Typography>
          <Typography variant="body1">
            {version.conan_version || 'N/A'}
          </Typography>
        </Grid>
        <Grid item xs={12} md={4}>
          <Typography variant="body2" color="textSecondary">
            Uploaded
          </Typography>
          <Typography variant="body1">
            {new Date(version.created_at).toLocaleDateString()}
            {version.uploaded_by ? ` by ${version.uploaded_by}` : ''}
          </Typography>
        </Grid>
        <Grid item xs={12} md={4}>
          <Typography variant="body2" color="textSecondary">
            Recipe Revision
          </Typography>
          <Typography variant="body1" style={{ fontFamily: 'monospace' }}>
            {version.recipe_revision || 'N/A'}
          </Typography>
        </Grid>
      </Grid>
    </InfoCard>
  );
}

// --- SecurityCard ---

function SecurityCard({
  version,
  binaries,
}: {
  version: PackageVersion;
  binaries: BinaryPackage[] | undefined;
}) {
  const classes = useStyles();

  let securityNotes: SecurityNote[] = [];
  if (version.security_notes) {
    try {
      securityNotes = JSON.parse(version.security_notes);
    } catch {
      // ignore parse errors
    }
  }

  const severityClass = (severity: string) => {
    switch (severity) {
      case 'critical': return classes.severityCritical;
      case 'high': return classes.severityHigh;
      case 'medium': return classes.severityMedium;
      default: return classes.severityLow;
    }
  };

  return (
    <InfoCard title="Security & Integrity">
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" gutterBottom>
            Upload Provenance
          </Typography>
          <Typography variant="body2">
            <strong>Uploaded by:</strong> {version.uploaded_by || 'Unknown'}
          </Typography>
          <Typography variant="body2">
            <strong>Upload time:</strong>{' '}
            {new Date(version.created_at).toLocaleString()}
          </Typography>
          <Typography variant="body2">
            <strong>Conan version:</strong> {version.conan_version || 'N/A'}
          </Typography>
        </Grid>

        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" gutterBottom>
            License
          </Typography>
          <Chip
            label={version.license || 'Unknown'}
            color={
              version.license && version.license !== 'Unknown'
                ? 'primary'
                : 'default'
            }
            variant="outlined"
          />
        </Grid>

        {binaries && binaries.length > 0 && (
          <Grid item xs={12}>
            <Typography variant="subtitle2" gutterBottom>
              Binary Checksums (SHA256)
            </Typography>
            {binaries.map(b => (
              <div key={b.id} className={classes.checksumRow}>
                <Typography variant="caption" color="textSecondary">
                  {b.os} / {b.arch} / {b.compiler} {b.compiler_version} /{' '}
                  {b.build_type}
                </Typography>
                <Typography className={classes.sha256}>{b.sha256}</Typography>
              </div>
            ))}
          </Grid>
        )}

        <Grid item xs={12}>
          {securityNotes.length > 0 ? (
            <>
              <Typography variant="subtitle2" gutterBottom>
                Known Vulnerabilities ({securityNotes.length})
              </Typography>
              {securityNotes.map((note, idx) => (
                <div key={idx} className={classes.cveRow}>
                  <span className={classes.cveStatus}>
                    {note.severity === 'critical' || note.severity === 'high' ? (
                      <StatusError />
                    ) : note.severity === 'medium' ? (
                      <StatusWarning />
                    ) : (
                      <StatusOK />
                    )}
                  </span>
                  <Typography
                    variant="body2"
                    className={`${classes.cveId} ${severityClass(note.severity)}`}
                  >
                    {note.cve}
                  </Typography>
                  <Typography variant="body2">
                    {note.description}
                  </Typography>
                  {note.url && (
                    <MuiLink
                      href={note.url}
                      target="_blank"
                      rel="noopener"
                      variant="body2"
                      style={{ marginLeft: 8 }}
                    >
                      Details
                    </MuiLink>
                  )}
                </div>
              ))}
            </>
          ) : (
            <div className={classes.cveRow}>
              <span className={classes.cveStatus}>
                <StatusOK />
              </span>
              <Typography variant="body2" color="textSecondary">
                No known vulnerabilities
              </Typography>
            </div>
          )}
        </Grid>
      </Grid>
    </InfoCard>
  );
}

// --- ReadmeCard ---

function ReadmeCard({ version }: { version: PackageVersion }) {
  const classes = useStyles();

  if (!version.readme_content) {
    return (
      <InfoCard title="README">
        <Typography variant="body2" color="textSecondary">
          No README provided. Upload a package with a README.md file to display
          documentation here.
        </Typography>
      </InfoCard>
    );
  }

  return (
    <InfoCard title="README">
      <div className={classes.readmeContainer}>
        <MarkdownContent content={version.readme_content} dialect="gfm" />
      </div>
    </InfoCard>
  );
}

// --- Dependency Graph SVG Tree ---

const NODE_W = 140;
const NODE_H = 44;
const H_GAP = 20;
const V_GAP = 60;

interface LayoutNode {
  node: GraphNode;
  x: number;
  y: number;
}

function computeLayout(
  rawNodes: GraphNode[],
  rawEdges: GraphEdge[],
): { layout: LayoutNode[]; svgWidth: number; svgHeight: number } {
  if (rawNodes.length === 0) return { layout: [], svgWidth: 0, svgHeight: 0 };

  // Deduplicate nodes by id (keep first occurrence)
  const seenIds = new Set<string>();
  const nodes = rawNodes.filter(n => {
    if (seenIds.has(n.id)) return false;
    seenIds.add(n.id);
    return true;
  });

  // Deduplicate edges (same from+to pair)
  const seenEdges = new Set<string>();
  const edges = rawEdges.filter(e => {
    const key = `${e.from}->${e.to}`;
    if (seenEdges.has(key)) return false;
    seenEdges.add(key);
    return true;
  });

  // Build adjacency list (parent → children) using only valid node IDs
  const validIds = new Set(nodes.map(n => n.id));
  const children: Record<string, string[]> = {};
  for (const n of nodes) children[n.id] = [];
  for (const e of edges) {
    if (validIds.has(e.from) && validIds.has(e.to)) {
      children[e.from].push(e.to);
    }
  }

  // Find root (isRoot flag or node with no incoming edges)
  const hasParent = new Set(edges.filter(e => validIds.has(e.to)).map(e => e.to));
  const rootNode = nodes.find(n => n.isRoot) ?? nodes.find(n => !hasParent.has(n.id)) ?? nodes[0];

  // Longest-path level assignment via Kahn's topological sort (DAG-aware):
  // A node is processed only after ALL its parents are processed, so its
  // depth is guaranteed to be the true maximum distance from the root.
  // This correctly places shared (diamond) dependencies below all their parents.
  const depth: Record<string, number> = {};
  const inDegree: Record<string, number> = {};
  const parents: Record<string, string[]> = {};
  for (const n of nodes) { inDegree[n.id] = 0; parents[n.id] = []; }
  for (const e of edges) {
    if (validIds.has(e.from) && validIds.has(e.to)) {
      inDegree[e.to] = (inDegree[e.to] ?? 0) + 1;
      parents[e.to].push(e.from);
    }
  }
  depth[rootNode.id] = 0;
  // Seed queue with nodes that have no parents (should just be root)
  const topoQueue: string[] = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
  const topoOrder: string[] = [];
  const visited = new Set<string>(topoQueue);
  while (topoQueue.length > 0) {
    const id = topoQueue.shift()!;
    topoOrder.push(id);
    // Each node's depth = max(parent depths) + 1
    const d = parents[id].reduce((max, pid) => Math.max(max, (depth[pid] ?? 0) + 1), depth[id] ?? 0);
    depth[id] = d;
    for (const cid of (children[id] || [])) {
      inDegree[cid]--;
      if (inDegree[cid] === 0) {
        visited.add(cid);
        topoQueue.push(cid);
      }
    }
  }

  // Group nodes by level
  const levelMap: Record<number, string[]> = {};
  for (const id of topoOrder) {
    const lvl = depth[id] ?? 0;
    if (!levelMap[lvl]) levelMap[lvl] = [];
    levelMap[lvl].push(id);
  }
  // Any disconnected nodes go at the bottom
  const disconnected = nodes.filter(n => !visited.has(n.id));
  if (disconnected.length > 0) {
    const maxLvl = Math.max(0, ...Object.keys(levelMap).map(Number));
    levelMap[maxLvl + 1] = disconnected.map(n => n.id);
  }

  const levels = Object.keys(levelMap)
    .map(Number)
    .sort((a, b) => a - b)
    .map(lvl => levelMap[lvl]);

  // Assign positions: center each level horizontally
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const layout: LayoutNode[] = [];
  let maxWidth = 0;

  for (let lvl = 0; lvl < levels.length; lvl++) {
    const ids = levels[lvl];
    const rowWidth = ids.length * NODE_W + (ids.length - 1) * H_GAP;
    if (rowWidth > maxWidth) maxWidth = rowWidth;
    for (let i = 0; i < ids.length; i++) {
      const n = nodeMap.get(ids[i]);
      if (!n) continue;
      layout.push({
        node: n,
        x: i * (NODE_W + H_GAP),
        y: lvl * (NODE_H + V_GAP),
      });
    }
  }

  // Center each row relative to maxWidth
  for (let lvl = 0; lvl < levels.length; lvl++) {
    const ids = levels[lvl];
    const rowWidth = ids.length * NODE_W + (ids.length - 1) * H_GAP;
    const offset = (maxWidth - rowWidth) / 2;
    for (const item of layout) {
      if (ids.includes(item.node.id)) item.x += offset;
    }
  }

  const svgWidth = maxWidth + 40;
  const svgHeight = levels.length * (NODE_H + V_GAP) + 20;
  return { layout, svgWidth, svgHeight };
}

function DepGraphSvg({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const theme = { primary: '#1976d2', build: '#f57c00', test: '#757575', root: '#388e3c' };
  const { layout, svgWidth, svgHeight } = computeLayout(nodes, edges);
  const posMap = new Map(layout.map(l => [l.node.id, l]));
  const PAD = 20;

  const nodeColor = (n: GraphNode) => {
    if (n.isRoot) return theme.root;
    if (n.context === 'build') return theme.build;
    if (n.context === 'test') return theme.test;
    return theme.primary;
  };

  return (
    <svg
      width={svgWidth + PAD * 2}
      height={svgHeight + PAD}
      style={{ display: 'block', minWidth: svgWidth + PAD * 2 }}
    >
      <g transform={`translate(${PAD}, ${PAD / 2})`}>
        {/* Edges */}
        {edges.map((e, i) => {
          const from = posMap.get(e.from);
          const to = posMap.get(e.to);
          if (!from || !to) return null;
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y + NODE_H;
          const x2 = to.x + NODE_W / 2;
          const y2 = to.y;
          const cy = (y1 + y2) / 2;
          return (
            <path
              key={i}
              d={`M${x1},${y1} C${x1},${cy} ${x2},${cy} ${x2},${y2}`}
              fill="none"
              stroke="#aaa"
              strokeWidth={1.5}
            />
          );
        })}
        {/* Nodes */}
        {layout.map(({ node, x, y }) => {
          const color = nodeColor(node);
          const label = node.name.length > 16 ? `${node.name.slice(0, 14)}…` : node.name;
          const ver = node.version.length > 12 ? `${node.version.slice(0, 10)}…` : node.version;
          const href = node.isRoot ? undefined : `/catalog/default/component/${node.name}?version=${encodeURIComponent(node.version)}`;
          const content = (
            <g key={node.id} transform={`translate(${x}, ${y})`} style={{ cursor: href ? 'pointer' : 'default' }}>
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={6}
                ry={6}
                fill={color}
                opacity={0.9}
              />
              <text
                x={NODE_W / 2}
                y={16}
                textAnchor="middle"
                fill="white"
                fontSize={12}
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                {label}
              </text>
              <text
                x={NODE_W / 2}
                y={30}
                textAnchor="middle"
                fill="rgba(255,255,255,0.85)"
                fontSize={10}
                fontFamily="monospace"
              >
                {ver}
              </text>
            </g>
          );
          if (href) {
            return (
              <a key={node.id} href={href}>
                {content}
              </a>
            );
          }
          return content;
        })}
      </g>
    </svg>
  );
}

// --- DependenciesCard ---

function DependenciesCard({
  entityRef,
  version,
}: {
  entityRef: string;
  version: string;
}) {
  const classes = useStyles();
  const api = useApi(conancratesApiRef);

  const { value: graph, loading: graphLoading } = useAsync(
    () => api.getGraph(entityRef, version),
    [entityRef, version],
  );
  const { value: deps, loading: depsLoading } = useAsync(
    () => api.getDependencies(entityRef, version),
    [entityRef, version],
  );

  const loading = graphLoading || depsLoading;

  if (loading) {
    return (
      <InfoCard title="Dependencies">
        <Progress />
      </InfoCard>
    );
  }

  const hasGraph = graph && graph.nodes.length > 1; // >1 means there's more than just the root
  const hasDeps = deps && deps.length > 0;

  if (!hasGraph && !hasDeps) {
    return (
      <InfoCard title="Dependencies">
        <Typography variant="body2" color="textSecondary">
          No dependencies.
        </Typography>
      </InfoCard>
    );
  }

  const requires = (deps || []).filter(d => d.dependency_type === 'requires');
  const buildRequires = (deps || []).filter(d => d.dependency_type === 'build_requires');
  const testRequires = (deps || []).filter(d => d.dependency_type === 'test_requires');

  const renderDepList = (depList: Dependency[], label: string) => {
    if (depList.length === 0) return null;
    return (
      <Box mb={2}>
        <Typography variant="subtitle2" gutterBottom>
          {label}
        </Typography>
        {depList.map(dep => {
          const depName =
            dep.requires_entity_ref.split('/').pop() ||
            dep.requires_entity_ref;
          const catalogLink = `/catalog/default/component/${depName}`;
          return (
            <div key={dep.id} className={classes.depRow}>
              <Chip
                label={depName}
                size="small"
                component="a"
                href={catalogLink}
                clickable
                variant="outlined"
                className={classes.depChip}
              />
              {dep.version_requirement && (
                <Typography variant="body2" color="textSecondary">
                  {dep.version_requirement}
                </Typography>
              )}
            </div>
          );
        })}
      </Box>
    );
  };

  const totalDeps = (deps?.length ?? 0);

  return (
    <InfoCard title={`Dependencies (${totalDeps})`}>
      {hasGraph && graph && (
        <Box mb={2}>
          <div className={classes.graphScrollWrapper}>
            <DepGraphSvg nodes={graph.nodes} edges={graph.edges} />
          </div>
          <Box display="flex" style={{ gap: 16, flexWrap: 'wrap' as const }}>
            <Box display="flex" alignItems="center" style={{ gap: 4 }}>
              <svg width={12} height={12}><rect width={12} height={12} rx={2} fill="#388e3c" /></svg>
              <Typography variant="caption">This package</Typography>
            </Box>
            <Box display="flex" alignItems="center" style={{ gap: 4 }}>
              <svg width={12} height={12}><rect width={12} height={12} rx={2} fill="#1976d2" /></svg>
              <Typography variant="caption">Runtime dep</Typography>
            </Box>
            <Box display="flex" alignItems="center" style={{ gap: 4 }}>
              <svg width={12} height={12}><rect width={12} height={12} rx={2} fill="#f57c00" /></svg>
              <Typography variant="caption">Build dep</Typography>
            </Box>
            <Box display="flex" alignItems="center" style={{ gap: 4 }}>
              <svg width={12} height={12}><rect width={12} height={12} rx={2} fill="#757575" /></svg>
              <Typography variant="caption">Test dep</Typography>
            </Box>
          </Box>
        </Box>
      )}
      {hasDeps && (
        <>
          {renderDepList(requires, 'Runtime Dependencies')}
          {renderDepList(buildRequires, 'Build Dependencies')}
          {renderDepList(testRequires, 'Test Dependencies')}
        </>
      )}
    </InfoCard>
  );
}

// --- BinariesTable ---

function BinariesTable({
  binaries,
  entityRef,
  version,
}: {
  binaries: BinaryPackage[];
  entityRef: string;
  version: string;
}) {
  const api = useApi(conancratesApiRef);

  if (binaries.length === 0) {
    return (
      <Typography variant="body2" color="textSecondary">
        No binaries available for this version.
      </Typography>
    );
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>OS</TableCell>
            <TableCell>Arch</TableCell>
            <TableCell>Compiler</TableCell>
            <TableCell>Build Type</TableCell>
            <TableCell>Size</TableCell>
            <TableCell>SHA256</TableCell>
            <TableCell align="right">Downloads</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {binaries.map(binary => (
            <TableRow key={binary.id}>
              <TableCell>
                <Chip label={binary.os} size="small" />
              </TableCell>
              <TableCell>{binary.arch}</TableCell>
              <TableCell>
                {binary.compiler} {binary.compiler_version}
              </TableCell>
              <TableCell>{binary.build_type}</TableCell>
              <TableCell>{formatBytes(binary.file_size)}</TableCell>
              <TableCell>
                <Tooltip title={binary.sha256 || 'N/A'}>
                  <Typography
                    variant="body2"
                    style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
                  >
                    {binary.sha256
                      ? `${binary.sha256.substring(0, 12)}...`
                      : 'N/A'}
                  </Typography>
                </Tooltip>
              </TableCell>
              <TableCell align="right">{binary.download_count}</TableCell>
              <TableCell align="right">
                <Tooltip title="Download binary">
                  <IconButton
                    size="small"
                    href={api.getDownloadUrl(
                      entityRef,
                      version,
                      binary.package_id,
                    )}
                  >
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {binary.rust_crate_file_path && (
                  <Tooltip title="Download Rust crate">
                    <IconButton
                      size="small"
                      href={api.getRustCrateUrl(
                        entityRef,
                        version,
                        binary.package_id,
                      )}
                    >
                      <CodeIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// --- RecipeViewer ---

function RecipeViewer({
  entityRef,
  version,
}: {
  entityRef: string;
  version: string;
}) {
  const api = useApi(conancratesApiRef);
  const {
    value: recipe,
    loading,
    error,
  } = useAsync(
    () => api.getRecipe(entityRef, version),
    [entityRef, version],
  );

  if (loading) return <Progress />;
  if (error)
    return <Typography color="error">Failed to load recipe</Typography>;
  if (!recipe) return null;

  return (
    <Accordion>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2">conanfile.py</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Box width="100%">
          <CodeSnippet text={recipe} language="python" showCopyCodeButton />
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}

// --- VersionDetail ---

function VersionDetail({
  entityRef,
  version,
}: {
  entityRef: string;
  version: PackageVersion;
}) {
  const api = useApi(conancratesApiRef);
  const {
    value: binaries,
    loading,
    error,
  } = useAsync(
    () => api.getBinaries(entityRef, version.version),
    [entityRef, version.version],
  );

  return (
    <Grid container spacing={3}>
      {/* Row 1: Package Information - full width */}
      <Grid item xs={12}>
        <PackageHeader version={version} />
      </Grid>

      {/* Row 2: README - full width */}
      <Grid item xs={12}>
        <ReadmeCard version={version} />
      </Grid>

      {/* Row 3: Dependencies (wide) + Security (narrower) */}
      <Grid item xs={12} md={8}>
        <DependenciesCard entityRef={entityRef} version={version.version} />
      </Grid>
      <Grid item xs={12} md={4}>
        <SecurityCard version={version} binaries={binaries} />
      </Grid>

      {/* Row 4: Binaries - full width (table too wide for sidebar) */}
      <Grid item xs={12}>
        <InfoCard title="Binaries">
          {loading && <Progress />}
          {error && <ResponseErrorPanel error={error} />}
          {binaries && (
            <BinariesTable
              binaries={binaries}
              entityRef={entityRef}
              version={version.version}
            />
          )}
        </InfoCard>
      </Grid>

      {/* Row 5: Recipe accordion - full width */}
      <Grid item xs={12}>
        <RecipeViewer entityRef={entityRef} version={version.version} />
      </Grid>
    </Grid>
  );
}

// --- Main Tab ---

export function EntityConancratesTab() {
  const classes = useStyles();
  const { entity } = useEntity();
  const entityRef = stringifyEntityRef(entity);
  const api = useApi(conancratesApiRef);

  const [selectedVersion, setSelectedVersion] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [deleteDialog, setDeleteDialog] = useState<'version' | 'package' | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    value: versions,
    loading,
    error,
  } = useAsync(() => api.getVersions(entityRef), [entityRef, refreshKey]);

  React.useEffect(() => {
    if (versions && versions.length > 0 && !selectedVersion) {
      const params = new URLSearchParams(window.location.search);
      const versionParam = params.get('version');
      const match = versionParam ? versions.find(v => v.version === versionParam) : undefined;
      setSelectedVersion(match ? match.version : versions[0].version);
    }
  }, [versions, selectedVersion]);

  const handleDeleteVersion = useCallback(async () => {
    if (!selectedVersion) return;
    setDeleting(true);
    try {
      await api.deleteVersion(entityRef, selectedVersion);
      setSelectedVersion('');
      setRefreshKey(k => k + 1);
    } catch (err) {
      console.error('Delete version failed:', err);
    } finally {
      setDeleting(false);
      setDeleteDialog(null);
    }
  }, [api, entityRef, selectedVersion]);

  const handleDeletePackage = useCallback(async () => {
    setDeleting(true);
    try {
      await api.deletePackage(entityRef);
      setSelectedVersion('');
      setRefreshKey(k => k + 1);
    } catch (err) {
      console.error('Delete package failed:', err);
    } finally {
      setDeleting(false);
      setDeleteDialog(null);
    }
  }, [api, entityRef]);

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;
  if (!versions || versions.length === 0) {
    return (
      <InfoCard title="MISO">
        <Typography variant="body1">
          No versions uploaded yet for this package.
        </Typography>
      </InfoCard>
    );
  }

  const currentVersion = versions.find(v => v.version === selectedVersion);

  return (
    <>
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <div className={classes.versionHeader}>
            <div>
              <Typography variant="h5">Package Registry</Typography>
              {currentVersion?.description && (
                <Typography
                  variant="body2"
                  color="textSecondary"
                  style={{ marginTop: 4 }}
                >
                  {currentVersion.description}
                </Typography>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FormControl
                variant="outlined"
                size="small"
                style={{ minWidth: 200 }}
              >
                <InputLabel>Version</InputLabel>
                <Select
                  value={selectedVersion}
                  onChange={e => setSelectedVersion(e.target.value as string)}
                  label="Version"
                >
                  {versions.map(v => (
                    <MenuItem key={v.version} value={v.version}>
                      {v.version}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Tooltip title="Delete this version">
                <IconButton
                  size="small"
                  onClick={() => setDeleteDialog('version')}
                  disabled={!selectedVersion}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete all versions">
                <Button
                  variant="outlined"
                  color="secondary"
                  size="small"
                  startIcon={<DeleteIcon />}
                  onClick={() => setDeleteDialog('package')}
                >
                  Delete All
                </Button>
              </Tooltip>
            </div>
          </div>
        </Grid>

        {currentVersion && (
          <Grid item xs={12}>
            <VersionDetail entityRef={entityRef} version={currentVersion} />
          </Grid>
        )}
      </Grid>

      <Dialog
        open={deleteDialog !== null}
        onClose={() => setDeleteDialog(null)}
      >
        <DialogTitle>
          {deleteDialog === 'package'
            ? 'Delete All Versions?'
            : `Delete Version ${selectedVersion}?`}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deleteDialog === 'package'
              ? 'This will permanently delete all versions, binaries, and dependencies for this package. This action cannot be undone.'
              : `This will permanently delete version ${selectedVersion} and all its binaries and dependencies. This action cannot be undone.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)} disabled={deleting}>
            Cancel
          </Button>
          <Button
            onClick={
              deleteDialog === 'package'
                ? handleDeletePackage
                : handleDeleteVersion
            }
            color="secondary"
            variant="contained"
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

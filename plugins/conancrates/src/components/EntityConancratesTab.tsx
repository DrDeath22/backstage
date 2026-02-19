import React, { useState } from 'react';
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
} from '@material-ui/core';
import {
  GetApp as DownloadIcon,
  ExpandMore as ExpandMoreIcon,
  Code as CodeIcon,
} from '@material-ui/icons';
import {
  InfoCard,
  Progress,
  ResponseErrorPanel,
  CodeSnippet,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { conancratesApiRef } from '../api/ConancratesClient';
import { PackageVersion, BinaryPackage } from '../api/types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

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
  } = useAsync(() => api.getRecipe(entityRef, version), [entityRef, version]);

  if (loading) return <Progress />;
  if (error) return <Typography color="error">Failed to load recipe</Typography>;
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
      <Grid item xs={12}>
        <InfoCard title={`Version ${version.version}`}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="body2" color="textSecondary">
                Recipe Revision
              </Typography>
              <Typography variant="body1" style={{ fontFamily: 'monospace' }}>
                {version.recipe_revision || 'N/A'}
              </Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="body2" color="textSecondary">
                Conan Version
              </Typography>
              <Typography variant="body1">
                {version.conan_version || 'N/A'}
              </Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <Typography variant="body2" color="textSecondary">
                Uploaded
              </Typography>
              <Typography variant="body1">
                {new Date(version.created_at).toLocaleDateString()}
              </Typography>
            </Grid>
          </Grid>
        </InfoCard>
      </Grid>

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

      <Grid item xs={12}>
        <RecipeViewer entityRef={entityRef} version={version.version} />
      </Grid>
    </Grid>
  );
}

export function EntityConancratesTab() {
  const { entity } = useEntity();
  const entityRef = stringifyEntityRef(entity);
  const api = useApi(conancratesApiRef);

  const [selectedVersion, setSelectedVersion] = useState<string>('');

  const {
    value: versions,
    loading,
    error,
  } = useAsync(() => api.getVersions(entityRef), [entityRef]);

  // Auto-select the first (latest) version when versions load
  React.useEffect(() => {
    if (versions && versions.length > 0 && !selectedVersion) {
      setSelectedVersion(versions[0].version);
    }
  }, [versions, selectedVersion]);

  if (loading) return <Progress />;
  if (error) return <ResponseErrorPanel error={error} />;
  if (!versions || versions.length === 0) {
    return (
      <InfoCard title="ConanCrates">
        <Typography variant="body1">
          No versions uploaded yet for this package.
        </Typography>
      </InfoCard>
    );
  }

  const currentVersion = versions.find(v => v.version === selectedVersion);

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h5">Package Registry</Typography>
          <FormControl variant="outlined" size="small" style={{ minWidth: 200 }}>
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
        </Box>
      </Grid>

      {currentVersion && (
        <Grid item xs={12}>
          <VersionDetail
            entityRef={entityRef}
            version={currentVersion}
          />
        </Grid>
      )}
    </Grid>
  );
}

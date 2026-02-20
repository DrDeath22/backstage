import { useState, useEffect } from 'react';
import {
  Header,
  Page,
  Content,
  InfoCard,
  Link,
} from '@backstage/core-components';
import { useApi } from '@backstage/core-plugin-api';
import {
  conancratesApiRef,
  type PackageVersion,
  type RegistryStats,
} from '@internal/plugin-conancrates';
import {
  Grid,
  Typography,
  Card,
  CardContent,
  Button,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  makeStyles,
} from '@material-ui/core';
import CategoryIcon from '@material-ui/icons/Category';
import MenuBookIcon from '@material-ui/icons/MenuBook';
import SearchIcon from '@material-ui/icons/Search';

const useStyles = makeStyles(theme => ({
  statNumber: {
    fontSize: '2.5rem',
    fontWeight: 700,
    color: theme.palette.primary.main,
    lineHeight: 1.2,
  },
  statLabel: {
    fontSize: '0.9rem',
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
  },
  statCard: {
    textAlign: 'center',
    padding: theme.spacing(2),
  },
  quickLinks: {
    display: 'flex',
    gap: theme.spacing(2),
    flexWrap: 'wrap' as const,
  },
  packageName: {
    fontWeight: 600,
  },
  tableRow: {
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
}));

export const HomePage = () => {
  const classes = useStyles();
  const api = useApi(conancratesApiRef);
  const [stats, setStats] = useState<RegistryStats | null>(null);
  const [recent, setRecent] = useState<PackageVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getStats(), api.getRecent(20)])
      .then(([s, r]) => {
        if (!cancelled) {
          setStats(s);
          setRecent(r);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  // Deduplicate recent versions by entity_ref, keeping the first (most recent) of each
  const uniquePackages: PackageVersion[] = [];
  const seen = new Set<string>();
  for (const v of recent) {
    if (!seen.has(v.entity_ref)) {
      seen.add(v.entity_ref);
      uniquePackages.push(v);
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const entityRefToPath = (entityRef: string) => {
    // component:default/zlib -> /catalog/default/component/zlib
    const match = entityRef.match(/^(\w+):(\w+)\/(.+)$/);
    if (match) {
      return `/catalog/${match[2]}/${match[1]}/${match[3]}`;
    }
    return '/catalog';
  };

  const entityRefToName = (entityRef: string) => {
    const match = entityRef.match(/^component:default\/(.+)$/);
    return match ? match[1] : entityRef;
  };

  return (
    <Page themeId="home">
      <Header
        title="ConanCrates"
        subtitle="Private C++ Package Registry"
      />
      <Content>
        <Grid container spacing={3}>
          {/* Stats Cards */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent className={classes.statCard}>
                <Typography className={classes.statNumber}>
                  {loading ? '-' : stats?.totalPackages ?? 0}
                </Typography>
                <Typography className={classes.statLabel}>
                  Packages
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent className={classes.statCard}>
                <Typography className={classes.statNumber}>
                  {loading ? '-' : stats?.totalVersions ?? 0}
                </Typography>
                <Typography className={classes.statLabel}>
                  Versions
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent className={classes.statCard}>
                <Typography className={classes.statNumber}>
                  {loading ? '-' : stats?.totalBinaries ?? 0}
                </Typography>
                <Typography className={classes.statLabel}>
                  Binaries
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Quick Links */}
          <Grid item xs={12}>
            <InfoCard title="Quick Links">
              <div className={classes.quickLinks}>
                <Link to="/catalog">
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<CategoryIcon />}
                  >
                    Browse All Packages
                  </Button>
                </Link>
                <Link to="/getting-started">
                  <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<MenuBookIcon />}
                  >
                    Getting Started
                  </Button>
                </Link>
                <Link to="/search">
                  <Button
                    variant="outlined"
                    color="primary"
                    startIcon={<SearchIcon />}
                  >
                    Search Packages
                  </Button>
                </Link>
              </div>
            </InfoCard>
          </Grid>

          {/* Recently Updated Packages */}
          <Grid item xs={12}>
            <InfoCard title="Recently Updated Packages">
              {loading ? (
                <Typography>Loading...</Typography>
              ) : uniquePackages.length === 0 ? (
                <Typography color="textSecondary">
                  No packages uploaded yet. Check the{' '}
                  <Link to="/getting-started">Getting Started</Link> guide to
                  upload your first package.
                </Typography>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Package</TableCell>
                      <TableCell>Latest Version</TableCell>
                      <TableCell>Description</TableCell>
                      <TableCell>License</TableCell>
                      <TableCell>Updated</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {uniquePackages.map(pkg => (
                      <TableRow
                        key={pkg.entity_ref}
                        className={classes.tableRow}
                      >
                        <TableCell>
                          <Link
                            to={entityRefToPath(pkg.entity_ref)}
                            className={classes.packageName}
                          >
                            {entityRefToName(pkg.entity_ref)}
                          </Link>
                        </TableCell>
                        <TableCell>{pkg.version}</TableCell>
                        <TableCell>
                          {pkg.description || '-'}
                        </TableCell>
                        <TableCell>{pkg.license || '-'}</TableCell>
                        <TableCell>{formatDate(pkg.updated_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </InfoCard>
          </Grid>
        </Grid>
      </Content>
    </Page>
  );
};

import {
  createPlugin,
  createRoutableExtension,
  createApiFactory,
  createRouteRef,
  discoveryApiRef,
  fetchApiRef,
} from '@backstage/core-plugin-api';
import { conancratesApiRef, ConancratesClient } from './api/ConancratesClient';

export const rootRouteRef = createRouteRef({
  id: 'conancrates',
});

export const conancrates = createPlugin({
  id: 'conancrates',
  routes: {
    root: rootRouteRef,
  },
  apis: [
    createApiFactory({
      api: conancratesApiRef,
      deps: { discoveryApi: discoveryApiRef, fetchApi: fetchApiRef },
      factory: ({ discoveryApi, fetchApi }) =>
        new ConancratesClient({ discoveryApi, fetchApi }),
    }),
  ],
});

export const EntityConancratesContent = conancrates.provide(
  createRoutableExtension({
    name: 'EntityConancratesContent',
    component: () =>
      import('./components/EntityConancratesTab').then(
        m => m.EntityConancratesTab,
      ),
    mountPoint: rootRouteRef,
  }),
);

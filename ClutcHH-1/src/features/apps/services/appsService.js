import { gamesService, launch } from '@/features/games/services/gamesService';

export const appsService = {
  list: (opts) => gamesService.listApps(opts),
  byCategory: async (category) => {
    const apps = await gamesService.listApps();
    if (!category || category === 'All') return apps;
    return apps.filter(
      (a) => (a.category === category) || a.tags.includes(category),
    );
  },
  byId: (id) => gamesService.byId(id),
};

export { launch };
export default appsService;

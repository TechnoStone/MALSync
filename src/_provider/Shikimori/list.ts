import { ListAbstract, listElement } from '../listAbstract';
import * as helper from './helper';
import * as definitions from '../definitions';

const pageSize = 25;

export class UserList extends ListAbstract {
  name = 'Shiki';

  public seperateRewatching = true;

  authenticationUrl = helper.authUrl;

  tempList: helper.StatusRequest[] = [];

  getUserObject() {
    return helper.userRequest().then(res => ({
      username: res.nickname,
      picture: res.image.x80,
      href: res.url,
    }));
  }

  deauth() {
    return api.settings.set('shikiToken', '');
  }

  _getSortingOptions() {
    return [];
  }

  getSortingOptions() {
    return [];
  }

  async getPart(): Promise<any> {
    if (this.offset < 2) this.offset = 0;
    con.log(
      '[UserList][Shiki]',
      `username: ${this.username}`,
      `status: ${this.status}`,
      `offset: ${this.offset}`,
    );

    if (!this.tempList.length) {
      let curSt = '';
      if (this.status !== definitions.status.All) {
        curSt = helper.statusTranslate[this.status];
      }

      const userId = await helper.userId();

      this.tempList = await helper.apiCall({
        path: 'v2/user_rates',
        type: 'GET',
        parameter: {
          user_id: userId,
          target_type: this.listType === 'anime' ? 'Anime' : 'Manga',
          status: curSt,
        },
      });
    }

    const list = this.tempList.slice(this.offset, this.offset + pageSize);

    this.offset += pageSize;

    if (this.offset >= this.tempList.length) {
      this.done = true;
    }

    const ids = list.map(el => el.target_id);

    const metadata: helper.MetaRequest[] = await helper.apiCall({
      path: `${this.listType}s`,
      parameter: { ids: ids.join(','), limit: pageSize },
      type: 'GET',
    });

    const keyedMetadata: { [key: string]: helper.MetaRequest } = {};
    for (const key in metadata) {
      const entry = metadata[key];
      keyedMetadata[entry.id] = entry;
    }

    if (this.listType === 'manga') {
      const keyedIds = Object.keys(keyedMetadata);
      const diffArr = ids.filter((o: any) => !keyedIds.includes(o));
      if (diffArr.length) {
        const diffMetadata: helper.MetaRequest[] = await helper.apiCall({
          path: 'ranobe',
          parameter: { ids: diffArr.join(','), limit: pageSize },
          type: 'GET',
        });
        for (const key in diffMetadata) {
          const entry = diffMetadata[key];
          keyedMetadata[entry.id] = entry;
        }
      }
    }

    // Prefer GraphQL poster URLs by default; fall back to REST image fields
    const posters: { [key: string]: { previewUrl?: string; preview2xUrl?: string } } = {};
    const userId = await helper.userId();
    const userRatesPosters = await helper.getAnimesPostersByUserRates(
      userId,
      this.offset / pageSize + 1,
      pageSize,
    );
    Object.assign(posters, userRatesPosters);

    const missingIds = ids.filter(
      id => !posters[id] || (!posters[id].previewUrl && !posters[id].preview2xUrl),
    );

    if (missingIds.length > 0) {
      // Shikimori GraphQL `animes` query only returns 2 IDs at a time.
      // Split missing IDs into chunks of 2 and fetch them.
      for (let i = 0; i < missingIds.length; i += 2) {
        const chunk = missingIds.slice(i, i + 2);
        const chunkPosters = await helper.getAnimesPostersByIds(chunk);
        Object.assign(posters, chunkPosters);
      }
    }

    return this.prepareData(list, keyedMetadata, posters);
  }

  private async prepareData(
    data: helper.StatusRequest[],
    metadata: { [key: string]: helper.MetaRequest },
    posters: { [key: string]: { previewUrl?: string; preview2xUrl?: string } } = {},
  ): Promise<listElement[]> {
    const newData = [] as listElement[];
    for (const key in data) {
      const entry = data[key];
      const meta = metadata[entry.target_id];

      // choose poster URLs:
      // - for list preview use poster.previewUrl
      // - for large/full image use poster.preview2xUrl
      // fall back to REST metadata.image.* when poster fields are missing
      const poster = posters && posters[entry.target_id] ? posters[entry.target_id] : null;

      let imagePreview = '';
      let imageLarge = '';

      if (poster && poster.previewUrl) {
        imagePreview = poster.previewUrl;
      } else if (meta && meta.image && meta.image.preview) {
        imagePreview = `${helper.domain}${meta.image.preview}`;
      } else if (meta && meta.image && meta.image.original) {
        imagePreview = `${helper.domain}${meta.image.original}`;
      }

      if (poster && poster.preview2xUrl) {
        imageLarge = poster.preview2xUrl;
      } else if (meta && meta.image && meta.image.original) {
        imageLarge = `${helper.domain}${meta.image.original}`;
      } else {
        imageLarge = imagePreview;
      }

      // eslint-disable-next-line no-await-in-loop
      const tempData = await this.fn({
        malId: entry.target_id,
        apiCacheKey: entry.target_id,
        uid: entry.target_id,
        cacheKey: entry.target_id,
        type: entry.target_type === 'Anime' ? 'anime' : 'manga',
        title: helper.title(meta ? meta.russian : '', meta ? meta.name : ''),
        url: meta ? `${helper.domain}${meta.url}` : '',
        score: entry.score ? entry.score : 0,
        watchedEp: entry.target_type === 'Anime' ? entry.episodes : entry.chapters,
        readVol: entry.target_type === 'Anime' ? undefined : entry.volumes,
        totalEp: entry.target_type === 'Anime' ? meta?.episodes || 0 : meta?.chapters || 0,
        totalVol: entry.target_type === 'Anime' ? undefined : meta?.volumes || 0,
        status: helper.statusTranslate[entry.status],
        rewatchCount: entry.rewatches,
        image: imagePreview,
        imageLarge,
        tags: entry.text,
      });
      newData.push(tempData);
    }

    return newData;
  }
}

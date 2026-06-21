// eslint-disable-next-line @typescript-eslint/no-unused-vars -- utilisé via `typeof` dans le declare global ci-dessous
import { usePhotoStore } from '../store/photoStore';

declare global {
  var usePhotoStore: typeof usePhotoStore;
}

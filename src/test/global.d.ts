import { usePhotoStore } from '../store/photoStore';

declare global {
  var usePhotoStore: typeof usePhotoStore;
}

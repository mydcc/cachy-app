import { loadInstruction } from '../../../../services/markdownLoader';

export const load = async ({ params }: { params: { lang?: string } }) => {
  return await loadInstruction('changelog', params.lang);
};

/**
 * Compatibility layer for next/navigation.
 * Redirects to react-router-dom equivalents.
 */
export { useSearchParams, useParams } from 'react-router-dom';

export function notFound(): never {
  throw new Response('Not Found', { status: 404 });
}

export { useNavigate as useRouter } from 'react-router-dom';

import { Helmet } from "react-helmet-async";

const SITE_URL = "https://soma-financas.lovable.app";
const SITE_NAME = "Soma | Assistente Financeiro";

interface SEOProps {
  title: string;
  description: string;
  path: string;
  /** If true, ask crawlers not to index this route (auth, reset, etc.) */
  noindex?: boolean;
}

const SEO = ({ title, description, path, noindex }: SEOProps) => {
  const fullTitle = `${title} | Soma`;
  const url = `${SITE_URL}${path}`;
  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
};

export default SEO;

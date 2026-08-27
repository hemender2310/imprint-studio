import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import ProjectView from '../../components/ProjectView';
import { projects, getProject, nextProject } from '../../data/projects';
import { contextPhotos } from '../../data/context';

/** All six prerender; anything else is a 404 at build time rather than a runtime render. */
export const dynamicParams = false;

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) return { title: 'IMPRINT' };
  return {
    title: `${project.name} — IMPRINT`,
    description: project.summary,
    openGraph: {
      title: `${project.name} — IMPRINT`,
      description: project.summary,
      images: [project.images[0]],
    },
  };
}

export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = getProject(slug);
  if (!project) notFound();

  return (
    <ProjectView
      project={project}
      next={nextProject(slug)}
      photo={contextPhotos[slug] ?? null}
    />
  );
}

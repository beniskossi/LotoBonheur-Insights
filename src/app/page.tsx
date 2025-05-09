import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { BarChart3, Layers, Lightbulb, ShieldCheck, ArrowRight } from "lucide-react";
import { getUniqueDrawNames, slugifyDrawName } from "@/config/draw-schedule";

export default function HomePage() {
  const uniqueDrawNames = getUniqueDrawNames();
  const exampleDrawSlug = uniqueDrawNames.length > 0 ? slugifyDrawName(uniqueDrawNames[0]) : 'example';

  return (
    <div className="space-y-8">
      <section className="text-center py-12">
        <h1 className="text-5xl font-bold tracking-tight text-primary mb-4">
          Bienvenue sur LotoBonheur Insights
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Votre plateforme complète pour l'analyse des résultats, les statistiques détaillées,
          et les prédictions intelligentes du Loto Bonheur.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <FeatureCard
          icon={<Layers className="h-8 w-8 text-accent" />}
          title="Données des Tirages"
          description="Accédez à l'historique complet des résultats, numéros gagnants et boules machine."
          linkText="Explorer les données"
          linkHref={`/draw/${exampleDrawSlug}/donnees`}
        />
        <FeatureCard
          icon={<Lightbulb className="h-8 w-8 text-accent" />}
          title="Consultant IA"
          description="Découvrez la régularité des numéros et leurs associations fréquentes."
          linkText="Consulter l'IA"
          linkHref={`/draw/${exampleDrawSlug}/consultant`}
        />
        <FeatureCard
          icon={<BarChart3 className="h-8 w-8 text-accent" />}
          title="Statistiques Avancées"
          description="Visualisez les fréquences, les numéros chauds et froids, et d'autres tendances."
          linkText="Voir les statistiques"
          linkHref={`/draw/${exampleDrawSlug}/statistiques`}
        />
        <FeatureCard
          icon={<ShieldCheck className="h-8 w-8 text-accent" />}
          title="Prédictions IA"
          description="Obtenez des suggestions éclairées pour les prochains tirages basées sur l'IA."
          linkText="Obtenir des prédictions"
          linkHref={`/draw/${exampleDrawSlug}/prediction`}
        />
      </section>

      <section className="py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Commencez par explorer une catégorie de tirage</CardTitle>
            <CardDescription>
              Sélectionnez un type de tirage dans le menu latéral pour accéder à ses informations spécifiques.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              Chaque catégorie de tirage (par exemple, 'Reveil', 'Etoile', etc.) possède ses propres sections de données,
              d'analyse par le consultant IA, de statistiques et de prédictions. Utilisez la navigation
              à gauche pour plonger dans les détails de chaque tirage.
            </p>
            {uniqueDrawNames.length > 0 && (
               <Button asChild className="mt-6">
                <Link href={`/draw/${slugifyDrawName(uniqueDrawNames[0])}/donnees`}>
                  Voir les données pour {uniqueDrawNames[0]} <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  linkText: string;
  linkHref: string;
}

function FeatureCard({ icon, title, description, linkText, linkHref }: FeatureCardProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-4">
        {icon}
        <CardTitle className="mt-2 text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow">
        <p className="text-sm text-muted-foreground text-center">{description}</p>
      </CardContent>
      <div className="p-6 pt-0">
        <Button asChild variant="outline" className="w-full">
          <Link href={linkHref}>
            {linkText} <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

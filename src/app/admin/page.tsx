import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export default function AdminPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Interface d'Administration</CardTitle>
          <CardDescription>
            Gestion des données des tirages Loto Bonheur.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center p-4 bg-muted rounded-md">
            <AlertTriangle className="h-6 w-6 mr-3 text-destructive" />
            <p className="text-destructive-foreground">
              Cette section est en cours de développement. Les fonctionnalités de gestion des données (modification, suppression, ajout, réinitialisation) seront implémentées ici.
            </p>
          </div>
          <div className="mt-6 space-y-4">
            <h3 className="text-lg font-semibold">Fonctionnalités Prévues :</h3>
            <ul className="list-disc list-inside text-muted-foreground space-y-1">
              <li>Visualisation des données de tirage par catégorie.</li>
              <li>Modification des numéros gagnants ou machine pour un tirage spécifique.</li>
              <li>Suppression de données de tirage erronées.</li>
              <li>Ajout manuel de données de tirage manquantes.</li>
              <li>Bouton de réinitialisation des données par catégorie (avec confirmation).</li>
              <li>Authentification sécurisée pour l'accès à cette interface.</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

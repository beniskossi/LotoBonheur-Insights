// src/app/admin/page.tsx
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, UploadCloud, DownloadCloud, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useToast } from "@/hooks/use-toast";
import { importLotteryDataFromPdf, exportLotteryDataToPdf } from "./actions";

export default function AdminPage() {
  const { toast } = useToast();
  const [isImporting, startImportTransition] = useTransition();
  const [isExporting, startExportTransition] = useTransition();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      setSelectedFile(event.target.files[0]);
    } else {
      setSelectedFile(null);
    }
  };

  const handleImportSubmit = async () => {
    if (!selectedFile) {
      toast({
        title: "Aucun fichier sélectionné",
        description: "Veuillez sélectionner un fichier PDF à importer.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("pdfFile", selectedFile);

    startImportTransition(async () => {
      try {
        const result = await importLotteryDataFromPdf(formData);
        if (result.success) {
          toast({
            title: "Importation Réussie",
            description: result.message || "Les données du PDF ont été importées.",
          });
        } else {
          toast({
            title: "Erreur d'Importation",
            description: result.error || "Une erreur est survenue lors de l'importation.",
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Erreur d'Importation",
          description: "Une erreur inattendue est survenue. Détails en console.",
          variant: "destructive",
        });
        console.error("Import error:", error);
      }
      setSelectedFile(null);
      // Reset file input
      const fileInput = document.getElementById('pdfFile') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    });
  };

  const handleExportSubmit = async () => {
    startExportTransition(async () => {
      try {
        const result = await exportLotteryDataToPdf();
        if (result.success && result.pdfData) {
          const byteCharacters = atob(result.pdfData);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/pdf' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = result.fileName || 'lotocrack_export.pdf';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);

          toast({
            title: "Exportation Réussie",
            description: "Le fichier PDF a été téléchargé.",
          });
        } else {
          toast({
            title: "Erreur d'Exportation",
            description: result.error || "Une erreur est survenue lors de l'exportation.",
            variant: "destructive",
          });
        }
      } catch (error) {
        toast({
          title: "Erreur d'Exportation",
          description: "Une erreur inattendue est survenue. Détails en console.",
          variant: "destructive",
        });
        console.error("Export error:", error);
      }
    });
  };

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
              <li>Importation et Exportation des données au format PDF.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Importer des Données (PDF)</CardTitle>
          <CardDescription>
            Importer des résultats de tirage à partir d'un fichier PDF. Le PDF doit être basé sur du texte et structuré de manière similaire au modèle d'exportation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="pdfFile">Fichier PDF</Label>
            <Input 
              id="pdfFile" 
              type="file" 
              accept=".pdf" 
              onChange={handleFileChange}
              className="mt-1" 
            />
          </div>
          <Button onClick={handleImportSubmit} disabled={isImporting || !selectedFile}>
            {isImporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UploadCloud className="mr-2 h-4 w-4" />
            )}
            Importer
          </Button>
          {isImporting && <p className="text-sm text-muted-foreground">Importation en cours...</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Exporter les Données (PDF)</CardTitle>
          <CardDescription>
            Exporter tous les résultats de tirage actuellement dans le système vers un fichier PDF.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleExportSubmit} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <DownloadCloud className="mr-2 h-4 w-4" />
            )}
            Exporter Tout en PDF
          </Button>
          {isExporting && <p className="text-sm text-muted-foreground">Exportation en cours...</p>}
        </CardContent>
      </Card>

    </div>
  );
}

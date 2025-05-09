// src/app/admin/page.tsx
'use client';

import type { LotteryResult } from "@/types/lottery";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, UploadCloud, DownloadCloud, Loader2, PlusCircle, Edit, Trash2, RefreshCw, Eye, ShieldAlert, Info } from "lucide-react";
import { useState, useTransition, useEffect, useCallback } from "react";
import { useForm, Controller, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { importLotteryDataFromPdf, exportLotteryDataToPdf, addLotteryResultAction, updateLotteryResultAction, deleteLotteryResultAction, resetCategoryDataAction } from "./actions";
import { getUniqueDrawNames } from "@/config/draw-schedule";
import { format, parseISO, isValid, parse as dateParse } from 'date-fns';

type LotteryResultWithId = LotteryResult & { clientId: string };
const ADMIN_DATA_STORAGE_KEY = 'lotocrackAdminData';

const lotteryResultSchema = z.object({
  draw_name: z.string().min(1, "Le nom du tirage est requis."),
  date: z.string().refine(val => {
    try {
      const parsed = dateParse(val, 'yyyy-MM-dd', new Date());
      return isValid(parsed);
    } catch {
      return false;
    }
  }, { message: "Date invalide. Format YYYY-MM-DD attendu." }),
  gagnants: z.array(z.number().min(1, "Numéro trop petit.").max(90, "Numéro trop grand.")).length(5, "5 numéros gagnants requis."),
  machine: z.array(z.number().min(1, "Numéro trop petit.").max(90, "Numéro trop grand.")).length(5, "5 numéros machine requis."),
});
type LotteryFormValues = z.infer<typeof lotteryResultSchema>;

export default function AdminPage() {
  const { toast } = useToast();
  const [isImporting, startImportTransition] = useTransition();
  const [isExporting, startExportTransition] = useTransition();
  const [isProcessing, startProcessingTransition] = useTransition();

  const [adminData, setAdminData] = useState<LotteryResultWithId[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [initialLoadMessage, setInitialLoadMessage] = useState<string | null>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [viewCategory, setViewCategory] = useState<string>("all");
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingResult, setEditingResult] = useState<LotteryResultWithId | null>(null);
  
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [deletingResultClientId, setDeletingResultClientId] = useState<string | null>(null);

  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [categoryToReset, setCategoryToReset] = useState<string>("");

  const drawNames = getUniqueDrawNames();

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<LotteryFormValues>({
    resolver: zodResolver(lotteryResultSchema),
    defaultValues: {
      draw_name: drawNames.length > 0 ? drawNames[0] : "",
      date: format(new Date(), 'yyyy-MM-dd'),
      gagnants: [],
      machine: []
    }
  });
  
  const fetchAndInitializeAdminData = useCallback(async () => {
    setIsLoadingData(true);
    setInitialLoadMessage(null);
    try {
      // Try loading from localStorage first
      const storedData = localStorage.getItem(ADMIN_DATA_STORAGE_KEY);
      if (storedData) {
        setAdminData(JSON.parse(storedData));
        setInitialLoadMessage(`Données chargées depuis le stockage local (${JSON.parse(storedData).length} résultats). Cliquez sur rafraîchir pour récupérer les données de l'API.`);
        setIsLoadingData(false);
        return;
      }

      // If no localStorage data, fetch from API
      const response = await fetch('/api/results'); 
      if (!response.ok) {
         const errorText = await response.text();
        throw new Error(`Échec de la récupération des données initiales de l'API: ${response.status} ${errorText}`);
      }
      const results: LotteryResult[] = await response.json();
      if (Array.isArray(results)) {
        const dataWithClientIds = results.map(r => ({ ...r, clientId: r.clientId || `${r.draw_name}-${r.date}-${Math.random().toString(36).substr(2, 9)}` }));
        setAdminData(dataWithClientIds);
        localStorage.setItem(ADMIN_DATA_STORAGE_KEY, JSON.stringify(dataWithClientIds));
        setInitialLoadMessage(`${dataWithClientIds.length} résultats chargés depuis l'API et sauvegardés localement.`);
      } else {
        setAdminData([]);
        setInitialLoadMessage("Aucun résultat valide retourné par l'API. Les données locales seront vides.");
      }
    } catch (error) {
      toast({ title: "Erreur de chargement initial", description: (error as Error).message, variant: "destructive" });
      setAdminData([]); 
      setInitialLoadMessage(`Erreur lors du chargement initial des données: ${(error as Error).message}`);
    } finally {
      setIsLoadingData(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAndInitializeAdminData();
  }, [fetchAndInitializeAdminData]);

  // Save to localStorage whenever adminData changes
  useEffect(() => {
    if (!isLoadingData) { // Avoid saving during initial load if data is coming from API
      localStorage.setItem(ADMIN_DATA_STORAGE_KEY, JSON.stringify(adminData));
    }
  }, [adminData, isLoadingData]);


  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedFile(event.target.files?.[0] || null);
  };

  const handleImportSubmit = async () => {
    if (!selectedFile) return toast({ title: "Aucun fichier", description: "Sélectionnez un PDF.", variant: "destructive" });
    const formData = new FormData();
    formData.append("pdfFile", selectedFile);
    startImportTransition(async () => {
      const result = await importLotteryDataFromPdf(formData);
      if (result.success && result.data) {
        const newDataWithClientIds = result.data.map(r => ({ ...r, clientId: `${r.draw_name}-${r.date}-${Math.random().toString(36).substr(2, 9)}` }));
        setAdminData(prevData => {
            const existingKeys = new Set(prevData.map(d => `${d.draw_name}-${d.date}`));
            const toAdd = newDataWithClientIds.filter(nd => !existingKeys.has(`${nd.draw_name}-${nd.date}`));
            toast({ title: "Importation Réussie", description: result.message || `${toAdd.length} nouveaux résultats importés et ajoutés.` });
            return [...prevData, ...toAdd];
        });
      } else {
        toast({ title: "Erreur d'Importation", description: result.error, variant: "destructive" });
      }
      setSelectedFile(null);
      const fileInput = document.getElementById('pdfFile') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    });
  };

  const handleExportSubmit = async () => {
    startExportTransition(async () => {
      const result = await exportLotteryDataToPdf(adminData);
      if (result.success && result.pdfData) {
        const byteCharacters = atob(result.pdfData);
        const byteNumbers = new Array(byteCharacters.length).fill(0).map((_, i) => byteCharacters.charCodeAt(i));
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = result.fileName || 'lotocrack_export_admin.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        toast({ title: "Exportation Réussie", description: "Fichier PDF téléchargé." });
      } else {
        toast({ title: "Erreur d'Exportation", description: result.error, variant: "destructive" });
      }
    });
  };

  const onAddSubmit: SubmitHandler<LotteryFormValues> = async (data) => {
    startProcessingTransition(async () => {
      const existingResult = adminData.find(r => r.draw_name === data.draw_name && r.date === data.date);
      if (existingResult) {
        toast({ title: "Erreur", description: "Un résultat pour ce tirage à cette date existe déjà.", variant: "destructive"});
        return;
      }
      // Simulate server action, then update local state
      const actionResult = await addLotteryResultAction(data); // This is a simulated action
      if (actionResult.success && actionResult.result) {
        setAdminData(prev => [...prev, { ...actionResult.result!, clientId: actionResult.result!.clientId || Date.now().toString() }]);
        toast({ title: "Succès", description: actionResult.message });
        setIsAddDialogOpen(false);
        reset({ draw_name: drawNames.length > 0 ? drawNames[0] : "", date: format(new Date(), 'yyyy-MM-dd'), gagnants: [], machine: [] });
      } else {
        toast({ title: "Erreur", description: actionResult.error, variant: "destructive" });
      }
    });
  };
  
  const onEditSubmit: SubmitHandler<LotteryFormValues> = async (data) => {
    if (!editingResult) return;
    const conflictingResult = adminData.find(r => r.clientId !== editingResult.clientId && r.draw_name === data.draw_name && r.date === data.date);
    if (conflictingResult) {
        toast({ title: "Erreur de Conflit", description: "Un autre résultat pour ce tirage à cette date existe déjà.", variant: "destructive"});
        return;
    }
    startProcessingTransition(async () => {
      // Simulate server action, then update local state
      const actionResult = await updateLotteryResultAction(editingResult.clientId, data); // Simulated
      if (actionResult.success && actionResult.result) {
        setAdminData(prev => prev.map(r => r.clientId === editingResult.clientId ? { ...r, ...actionResult.result!, clientId: editingResult.clientId } : r));
        toast({ title: "Succès", description: actionResult.message });
        setIsEditDialogOpen(false);
        setEditingResult(null);
        reset({ draw_name: drawNames.length > 0 ? drawNames[0] : "", date: format(new Date(), 'yyyy-MM-dd'), gagnants: [], machine: [] });
      } else {
        toast({ title: "Erreur", description: actionResult.error, variant: "destructive" });
      }
    });
  };

  const openEditDialog = (resultToEdit: LotteryResultWithId) => {
    setEditingResult(resultToEdit);
    reset({ 
      draw_name: resultToEdit.draw_name,
      date: resultToEdit.date, 
      gagnants: resultToEdit.gagnants.map(Number),
      machine: resultToEdit.machine.map(Number)
    });
    setIsEditDialogOpen(true);
  };

  const handleDeleteClick = (clientId: string) => {
    setDeletingResultClientId(clientId);
    setIsConfirmDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingResultClientId) return;
    startProcessingTransition(async () => {
      // Simulate server action, then update local state
      const actionResult = await deleteLotteryResultAction(deletingResultClientId); // Simulated
      if (actionResult.success) {
        setAdminData(prev => prev.filter(r => r.clientId !== deletingResultClientId));
        toast({ title: "Succès", description: actionResult.message });
      } else {
        toast({ title: "Erreur", description: actionResult.error, variant: "destructive" });
      }
      setIsConfirmDeleteDialogOpen(false);
      setDeletingResultClientId(null);
    });
  };

  const handleResetCategoryClick = (category: string) => {
    if (!category) {
        toast({title: "Aucune catégorie", description: "Veuillez sélectionner une catégorie à réinitialiser.", variant: "destructive"});
        return;
    }
    setCategoryToReset(category);
    setIsResetDialogOpen(true);
  };

  const confirmResetCategory = async () => {
    if (!categoryToReset) return;
    startProcessingTransition(async () => {
      // Simulate server action, then update local state
      const actionResult = await resetCategoryDataAction(categoryToReset); // Simulated
      if (actionResult.success) {
        setAdminData(prev => prev.filter(r => r.draw_name !== categoryToReset));
        toast({ title: "Succès", description: actionResult.message });
      } else {
        toast({ title: "Erreur", description: actionResult.error, variant: "destructive" });
      }
      setIsResetDialogOpen(false);
      setCategoryToReset("");
    });
  };

  const sortedAdminData = [...adminData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const filteredData = viewCategory === "all" ? sortedAdminData : sortedAdminData.filter(r => r.draw_name === viewCategory);

  const parseNumbersString = (str: string): number[] => {
    if (!str.trim()) return [];
    return str.split(/[,;\s]+/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= 90);
  }

  return (
    <div className="space-y-8 p-4 md:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Interface d'Administration</CardTitle>
          <CardDescription>
            Gestion des données des tirages Loto Bonheur. Les modifications ici affectent les données stockées localement dans votre navigateur.
            Pour une application de production, une base de données persistante (ex: Firebase) et une authentification robuste sont nécessaires.
          </CardDescription>
        </CardHeader>
         {initialLoadMessage && (
            <CardFooter>
                <p className="text-sm text-muted-foreground">{initialLoadMessage}</p>
            </CardFooter>
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center"><ShieldAlert className="mr-2 h-5 w-5 text-destructive" /> Authentification et Base de Données</CardTitle></CardHeader>
        <CardContent>
            <p className="text-muted-foreground">
                <strong>Authentification :</strong> Une authentification sécurisée (par exemple, avec Firebase Auth ou NextAuth.js) est requise pour protéger cette interface en production.
            </p>
             <p className="text-muted-foreground mt-2">
                <strong>Persistance des Données :</strong> Actuellement, les données gérées ici sont stockées dans le `localStorage` de votre navigateur. Pour une solution multi-utilisateurs ou plus robuste, une base de données comme Firebase Firestore est recommandée.
            </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Importer des Données (PDF)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="pdfFile">Fichier PDF</Label>
              <Input id="pdfFile" type="file" accept=".pdf" onChange={handleFileChange} className="mt-1" />
            </div>
            <Button onClick={handleImportSubmit} disabled={isImporting || !selectedFile} className="w-full">
              {isImporting ? <Loader2 className="animate-spin" /> : <UploadCloud />} Importer
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Exporter les Données (PDF)</CardTitle></CardHeader>
          <CardContent>
            <Button onClick={handleExportSubmit} disabled={isExporting || adminData.length === 0} className="w-full">
              {isExporting ? <Loader2 className="animate-spin" /> : <DownloadCloud />} Exporter
            </Button>
          </CardContent>
        </Card>
      </div>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Visualiser et Gérer les Données</CardTitle>
            <CardDescription>Affichez, modifiez ou supprimez les résultats existants.</CardDescription>
          </div>
          <Button onClick={() => { reset({ draw_name: drawNames.length > 0 ? drawNames[0] : "", date: format(new Date(), 'yyyy-MM-dd'), gagnants: [], machine: [] }); setIsAddDialogOpen(true); }}>
            <PlusCircle className="mr-2 h-4 w-4" /> Ajouter un Résultat
          </Button>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Label htmlFor="viewCategory">Filtrer par catégorie</Label>
            <Select value={viewCategory} onValueChange={setViewCategory}>
              <SelectTrigger id="viewCategory"><SelectValue placeholder="Sélectionner une catégorie" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories</SelectItem>
                {drawNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {isLoadingData ? <div className="flex justify-center py-10"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div> : 
            filteredData.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <Info className="mx-auto h-12 w-12 mb-4" />
                Aucune donnée à afficher pour {viewCategory === "all" ? "toutes les catégories" : `la catégorie ${viewCategory}`}.
              </div>
            ) : (
            <div className="overflow-x-auto rounded-md border">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Tirage</TableHead>
                        <TableHead>Gagnants</TableHead>
                        <TableHead>Machine</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {filteredData.map((r) => (
                        <TableRow key={r.clientId}>
                        <TableCell>{format(parseISO(r.date), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>{r.draw_name}</TableCell>
                        <TableCell>{r.gagnants.join(', ')}</TableCell>
                        <TableCell>{r.machine.join(', ')}</TableCell>
                        <TableCell className="space-x-1 text-right">
                            <Button variant="outline" size="icon" onClick={() => openEditDialog(r)}><Edit className="h-4 w-4" /></Button>
                            <Button variant="destructive" size="icon" onClick={() => handleDeleteClick(r.clientId!)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
            </div>
          )}
        </CardContent>
        <CardFooter>
            <Button onClick={fetchAndInitializeAdminData} variant="outline" disabled={isLoadingData}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
                Recharger les Données depuis l'API (Écrase les données locales)
            </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader><CardTitle>Réinitialiser les Données par Catégorie</CardTitle></CardHeader>
        <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-grow">
                    <Label htmlFor="resetCategory">Catégorie à réinitialiser</Label>
                    <Select value={categoryToReset} onValueChange={setCategoryToReset}>
                        <SelectTrigger id="resetCategory"><SelectValue placeholder="Sélectionner une catégorie" /></SelectTrigger>
                        <SelectContent>
                        {drawNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button variant="destructive" disabled={!categoryToReset || isProcessing} className="w-full sm:w-auto">
                            <Trash2 className="mr-2 h-4 w-4" /> Réinitialiser la Catégorie
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader><AlertDialogTitle>Confirmer la Réinitialisation</AlertDialogTitle></AlertDialogHeader>
                        <AlertDialogDescription>
                        Êtes-vous sûr de vouloir supprimer TOUS les résultats pour la catégorie "{categoryToReset}" ? Cette action est irréversible.
                        </AlertDialogDescription>
                        <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => { setIsResetDialogOpen(false); } }>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmResetCategory} disabled={isProcessing} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                            {isProcessing ? <Loader2 className="animate-spin"/> : "Réinitialiser"}
                        </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </CardContent>
      </Card>

      {/* Add Result Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un Nouveau Résultat</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onAddSubmit)} className="space-y-4">
            <div>
              <Label htmlFor="add_draw_name">Nom du Tirage</Label>
              <Controller
                name="draw_name"
                control={control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <SelectTrigger id="add_draw_name"><SelectValue placeholder="Sélectionner tirage" /></SelectTrigger>
                    <SelectContent>{drawNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
                  </Select>
                )}
              />
              {errors.draw_name && <p className="text-destructive text-sm">{errors.draw_name.message}</p>}
            </div>
            <div>
              <Label htmlFor="add_date">Date</Label>
              <Input id="add_date" type="date" {...register("date")} />
              {errors.date && <p className="text-destructive text-sm">{errors.date.message}</p>}
            </div>
            <div>
              <Label htmlFor="add_gagnants">Numéros Gagnants (séparés par virgule/espace)</Label>
              <Controller
                name="gagnants"
                control={control}
                render={({ field }) => <Input id="add_gagnants" placeholder="1,2,3,4,5" onChange={e => field.onChange(parseNumbersString(e.target.value))} value={Array.isArray(field.value) ? field.value.join(',') : ''} />}
              />
              {errors.gagnants && <p className="text-destructive text-sm">{errors.gagnants.root?.message || (errors.gagnants as any).message || (errors.gagnants as any)[0]?.message}</p>}
            </div>
             <div>
              <Label htmlFor="add_machine">Numéros Machine (séparés par virgule/espace)</Label>
               <Controller
                name="machine"
                control={control}
                render={({ field }) => <Input id="add_machine" placeholder="6,7,8,9,10" onChange={e => field.onChange(parseNumbersString(e.target.value))} value={Array.isArray(field.value) ? field.value.join(',') : ''} />}
              />
              {errors.machine && <p className="text-destructive text-sm">{errors.machine.root?.message || (errors.machine as any).message || (errors.machine as any)[0]?.message}</p>}
            </div>
            <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Annuler</Button></DialogClose>
                <Button type="submit" disabled={isProcessing}>{isProcessing ? <Loader2 className="animate-spin"/> : "Ajouter"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Result Dialog */}
       <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setEditingResult(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le Résultat</DialogTitle></DialogHeader>
          {editingResult && (
            <form onSubmit={handleSubmit(onEditSubmit)} className="space-y-4">
               <div>
                <Label htmlFor="edit_draw_name">Nom du Tirage</Label>
                <Controller
                    name="draw_name"
                    control={control}
                    render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value}>
                        <SelectTrigger id="edit_draw_name"><SelectValue placeholder="Sélectionner tirage" /></SelectTrigger>
                        <SelectContent>{drawNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}</SelectContent>
                    </Select>
                    )}
                />
                {errors.draw_name && <p className="text-destructive text-sm">{errors.draw_name.message}</p>}
              </div>
              <div>
                <Label htmlFor="edit_date">Date</Label>
                <Input id="edit_date" type="date" {...register("date")} />
                {errors.date && <p className="text-destructive text-sm">{errors.date.message}</p>}
              </div>
              <div>
                <Label htmlFor="edit_gagnants">Numéros Gagnants (séparés par virgule/espace)</Label>
                 <Controller
                    name="gagnants"
                    control={control}
                    render={({ field }) => <Input id="edit_gagnants" placeholder="1,2,3,4,5" onChange={e => field.onChange(parseNumbersString(e.target.value))} value={Array.isArray(field.value) ? field.value.join(',') : ''} />}
                />
                {errors.gagnants && <p className="text-destructive text-sm">{errors.gagnants.root?.message || (errors.gagnants as any).message || (errors.gagnants as any)[0]?.message}</p>}
              </div>
              <div>
                <Label htmlFor="edit_machine">Numéros Machine (séparés par virgule/espace)</Label>
                <Controller
                    name="machine"
                    control={control}
                    render={({ field }) => <Input id="edit_machine" placeholder="6,7,8,9,10" onChange={e => field.onChange(parseNumbersString(e.target.value))} value={Array.isArray(field.value) ? field.value.join(',') : ''} />}
                />
                {errors.machine && <p className="text-destructive text-sm">{errors.machine.root?.message || (errors.machine as any).message || (errors.machine as any)[0]?.message}</p>}
              </div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline" onClick={() => {setIsEditDialogOpen(false); setEditingResult(null);}}>Annuler</Button></DialogClose>
                <Button type="submit" disabled={isProcessing}>{isProcessing ? <Loader2 className="animate-spin"/> : "Sauvegarder"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isConfirmDeleteDialogOpen} onOpenChange={setIsConfirmDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Confirmer la Suppression</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogDescription>Êtes-vous sûr de vouloir supprimer ce résultat ? Cette action est irréversible.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {setDeletingResultClientId(null); setIsConfirmDeleteDialogOpen(false);}}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isProcessing} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                {isProcessing ? <Loader2 className="animate-spin"/> : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Reset Category Confirmation Dialog: This is now integrated into the Card above using AlertDialogTrigger directly */}
    </div>
  );
}

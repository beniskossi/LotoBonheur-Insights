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
import { format, parseISO, isValid } from 'date-fns';

type LotteryResultWithId = LotteryResult & { clientId: string };

const lotteryResultSchema = z.object({
  draw_name: z.string().min(1, "Le nom du tirage est requis."),
  date: z.string().refine(val => isValid(parseISO(val)), { message: "Date invalide. Format YYYY-MM-DD attendu." }),
  gagnants: z.array(z.number().min(1).max(90)).length(5, "5 numéros gagnants requis."),
  machine: z.array(z.number().min(1).max(90)).length(5, "5 numéros machine requis."),
});
type LotteryFormValues = z.infer<typeof lotteryResultSchema>;

export default function AdminPage() {
  const { toast } = useToast();
  const [isImporting, startImportTransition] = useTransition();
  const [isExporting, startExportTransition] = useTransition();
  const [isProcessing, startProcessingTransition] = useTransition();

  const [adminData, setAdminData] = useState<LotteryResultWithId[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [viewCategory, setViewCategory] = useState<string>("all");
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingResult, setEditingResult] = useState<LotteryResultWithId | null>(null);
  
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
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
  
  const fetchAdminData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const response = await fetch('/api/results');
      if (!response.ok) throw new Error('Failed to fetch results');
      const results: LotteryResult[] = await response.json();
      setAdminData(results.map(r => ({ ...r, clientId: r.clientId || `${r.draw_name}-${r.date}-${Math.random().toString(36).substr(2, 9)}` })));
    } catch (error) {
      toast({ title: "Erreur de chargement", description: (error as Error).message, variant: "destructive" });
    } finally {
      setIsLoadingData(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAdminData();
  }, [fetchAdminData]);

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
        // Simple merge: append new, non-duplicate entries (by date and draw_name)
        setAdminData(prevData => {
            const existingKeys = new Set(prevData.map(d => `${d.draw_name}-${d.date}`));
            const toAdd = newDataWithClientIds.filter(nd => !existingKeys.has(`${nd.draw_name}-${nd.date}`));
            return [...prevData, ...toAdd];
        });
        toast({ title: "Importation Réussie", description: result.message || `${result.importedCount} résultats importés.` });
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
      const result = await exportLotteryDataToPdf(adminData); // Use local adminData
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
      const result = await addLotteryResultAction(data);
      if (result.success && result.result) {
        setAdminData(prev => [...prev, { ...result.result!, clientId: result.result!.clientId || Date.now().toString() }]);
        toast({ title: "Succès", description: result.message });
        setIsAddDialogOpen(false);
        reset();
      } else {
        toast({ title: "Erreur", description: result.error, variant: "destructive" });
      }
    });
  };
  
  const onEditSubmit: SubmitHandler<LotteryFormValues> = async (data) => {
    if (!editingResult) return;
    startProcessingTransition(async () => {
      const result = await updateLotteryResultAction(editingResult.clientId, data);
      if (result.success && result.result) {
        setAdminData(prev => prev.map(r => r.clientId === editingResult.clientId ? { ...r, ...result.result! } : r));
        toast({ title: "Succès", description: result.message });
        setIsEditDialogOpen(false);
        setEditingResult(null);
        reset();
      } else {
        toast({ title: "Erreur", description: result.error, variant: "destructive" });
      }
    });
  };

  const openEditDialog = (resultToEdit: LotteryResultWithId) => {
    setEditingResult(resultToEdit);
    reset({ // Pre-fill form
      draw_name: resultToEdit.draw_name,
      date: resultToEdit.date,
      gagnants: resultToEdit.gagnants.map(Number), // Ensure numbers
      machine: resultToEdit.machine.map(Number)
    });
    setIsEditDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deletingResultClientId) return;
    startProcessingTransition(async () => {
      const result = await deleteLotteryResultAction(deletingResultClientId);
      if (result.success) {
        setAdminData(prev => prev.filter(r => r.clientId !== deletingResultClientId));
        toast({ title: "Succès", description: result.message });
      } else {
        toast({ title: "Erreur", description: result.error, variant: "destructive" });
      }
      setIsDeleteDialogOpen(false);
      setDeletingResultClientId(null);
    });
  };

  const confirmResetCategory = async () => {
    if (!categoryToReset) return;
    startProcessingTransition(async () => {
      const result = await resetCategoryDataAction(categoryToReset);
      if (result.success) {
        setAdminData(prev => prev.filter(r => r.draw_name !== categoryToReset));
        toast({ title: "Succès", description: result.message });
      } else {
        toast({ title: "Erreur", description: result.error, variant: "destructive" });
      }
      setIsResetDialogOpen(false);
      setCategoryToReset("");
    });
  };

  const filteredData = viewCategory === "all" ? adminData : adminData.filter(r => r.draw_name === viewCategory);

  const parseNumbersString = (str: string): number[] => str.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));


  return (
    <div className="space-y-8 p-4 md:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Interface d'Administration</CardTitle>
          <CardDescription>
            Gestion des données des tirages Loto Bonheur. Les modifications ici sont simulées et affectent l'état local de cette page.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* AUTHENTICATION PLACEHOLDER */}
      <Card>
        <CardHeader>
            <CardTitle className="flex items-center"><ShieldAlert className="mr-2 h-5 w-5 text-destructive" /> Authentification</CardTitle>
        </CardHeader>
        <CardContent>
            <p className="text-muted-foreground">
                Une authentification sécurisée (par exemple, avec Firebase Auth ou NextAuth.js) est requise pour protéger cette interface en production. Cette fonctionnalité sera implémentée ultérieurement.
            </p>
        </CardContent>
      </Card>

      {/* IMPORT/EXPORT */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Importer des Données (PDF)</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="pdfFile">Fichier PDF</Label>
              <Input id="pdfFile" type="file" accept=".pdf" onChange={handleFileChange} className="mt-1" />
            </div>
            <Button onClick={handleImportSubmit} disabled={isImporting || !selectedFile}>
              {isImporting ? <Loader2 className="animate-spin" /> : <UploadCloud />} Importer
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Exporter les Données (PDF)</CardTitle></CardHeader>
          <CardContent>
            <Button onClick={handleExportSubmit} disabled={isExporting || adminData.length === 0}>
              {isExporting ? <Loader2 className="animate-spin" /> : <DownloadCloud />} Exporter
            </Button>
          </CardContent>
        </Card>
      </div>
      
      {/* DATA VISUALIZATION & MANAGEMENT */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Visualiser et Gérer les Données</CardTitle>
            <CardDescription>Affichez, modifiez ou supprimez les résultats existants.</CardDescription>
          </div>
          <Button onClick={() => { reset(); setIsAddDialogOpen(true); }}>
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
            <div className="overflow-x-auto">
                <Table>
                    <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Tirage</TableHead>
                        <TableHead>Gagnants</TableHead>
                        <TableHead>Machine</TableHead>
                        <TableHead>Actions</TableHead>
                    </TableRow>
                    </TableHeader>
                    <TableBody>
                    {filteredData.map((r) => (
                        <TableRow key={r.clientId}>
                        <TableCell>{format(parseISO(r.date), 'dd/MM/yyyy')}</TableCell>
                        <TableCell>{r.draw_name}</TableCell>
                        <TableCell>{r.gagnants.join(', ')}</TableCell>
                        <TableCell>{r.machine.join(', ')}</TableCell>
                        <TableCell className="space-x-2">
                            <Button variant="outline" size="icon" onClick={() => openEditDialog(r)}><Edit className="h-4 w-4" /></Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" size="icon" onClick={() => setDeletingResultClientId(r.clientId)}><Trash2 className="h-4 w-4" /></Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader><AlertDialogTitle>Confirmer la Suppression</AlertDialogTitle></AlertDialogHeader>
                                <AlertDialogDescription>Êtes-vous sûr de vouloir supprimer ce résultat ? Cette action est irréversible.</AlertDialogDescription>
                                <AlertDialogFooter>
                                  <AlertDialogCancel onClick={() => setDeletingResultClientId(null)}>Annuler</AlertDialogCancel>
                                  <AlertDialogAction onClick={confirmDelete} disabled={isProcessing} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                                      {isProcessing ? <Loader2 className="animate-spin"/> : "Supprimer"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                        </TableCell>
                        </TableRow>
                    ))}
                    </TableBody>
                </Table>
            </div>
          )}
        </CardContent>
        <CardFooter>
            <Button onClick={fetchAdminData} variant="outline">
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
                Rafraîchir les données depuis la source
            </Button>
        </CardFooter>
      </Card>

      {/* RESET DATA */}
      <Card>
        <CardHeader><CardTitle>Réinitialiser les Données par Catégorie</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Label htmlFor="resetCategory">Catégorie à réinitialiser</Label>
          <Select value={categoryToReset} onValueChange={setCategoryToReset}>
            <SelectTrigger id="resetCategory"><SelectValue placeholder="Sélectionner une catégorie" /></SelectTrigger>
            <SelectContent>
              {drawNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" disabled={!categoryToReset || isProcessing}>
                {isProcessing ? <Loader2 className="animate-spin"/> : <Trash2 />} Réinitialiser la Catégorie
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader><AlertDialogTitle>Confirmer la Réinitialisation</AlertDialogTitle></AlertDialogHeader>
              <AlertDialogDescription>
                Êtes-vous sûr de vouloir supprimer TOUS les résultats pour la catégorie "{categoryToReset}" ? Cette action est irréversible.
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => { setCategoryToReset(""); setIsResetDialogOpen(false); } }>Annuler</AlertDialogCancel>
                <AlertDialogAction onClick={confirmResetCategory} disabled={isProcessing} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                    {isProcessing ? <Loader2 className="animate-spin"/> : "Réinitialiser"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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
              <Label htmlFor="add_gagnants">Numéros Gagnants (séparés par virgule)</Label>
              <Controller
                name="gagnants"
                control={control}
                render={({ field }) => <Input id="add_gagnants" placeholder="1,2,3,4,5" onChange={e => field.onChange(parseNumbersString(e.target.value))} value={field.value.join(',')} />}
              />
              {errors.gagnants && <p className="text-destructive text-sm">{errors.gagnants.message}</p>}
            </div>
             <div>
              <Label htmlFor="add_machine">Numéros Machine (séparés par virgule)</Label>
               <Controller
                name="machine"
                control={control}
                render={({ field }) => <Input id="add_machine" placeholder="6,7,8,9,10" onChange={e => field.onChange(parseNumbersString(e.target.value))} value={field.value.join(',')} />}
              />
              {errors.machine && <p className="text-destructive text-sm">{errors.machine.message}</p>}
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
                <Label htmlFor="edit_gagnants">Numéros Gagnants (séparés par virgule)</Label>
                 <Controller
                    name="gagnants"
                    control={control}
                    render={({ field }) => <Input id="edit_gagnants" placeholder="1,2,3,4,5" onChange={e => field.onChange(parseNumbersString(e.target.value))} value={field.value.join(',')} />}
                />
                {errors.gagnants && <p className="text-destructive text-sm">{errors.gagnants.message}</p>}
              </div>
              <div>
                <Label htmlFor="edit_machine">Numéros Machine (séparés par virgule)</Label>
                <Controller
                    name="machine"
                    control={control}
                    render={({ field }) => <Input id="edit_machine" placeholder="6,7,8,9,10" onChange={e => field.onChange(parseNumbersString(e.target.value))} value={field.value.join(',')} />}
                />
                {errors.machine && <p className="text-destructive text-sm">{errors.machine.message}</p>}
              </div>
              <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline" onClick={() => {setIsEditDialogOpen(false); setEditingResult(null);}}>Annuler</Button></DialogClose>
                <Button type="submit" disabled={isProcessing}>{isProcessing ? <Loader2 className="animate-spin"/> : "Sauvegarder"}</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog - Note: This one is programmatically opened and doesn't use AlertDialogTrigger */}
      {/* It is correctly structured if opened via setIsDeleteDialogOpen(true) and not an AlertDialogTrigger */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Confirmer la Suppression</AlertDialogTitle></AlertDialogHeader>
          <AlertDialogDescription>Êtes-vous sûr de vouloir supprimer ce résultat ? Cette action est irréversible.</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {setDeletingResultClientId(null); setIsDeleteDialogOpen(false);}}>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isProcessing} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                {isProcessing ? <Loader2 className="animate-spin"/> : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

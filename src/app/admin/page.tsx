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
import { AlertTriangle, UploadCloud, DownloadCloud, Loader2, PlusCircle, Edit, Trash2, RefreshCw, Eye, ShieldAlert, Info, Filter, FileJson } from "lucide-react";
import { useState, useTransition, useEffect, useCallback } from "react";
import { useForm, Controller, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import {
  importLotteryDataFromJson,
  exportLotteryDataToJson,
  addLotteryResultAction,
  updateLotteryResultAction,
  deleteLotteryResultAction,
  resetCategoryDataAction,
} from "./actions";
import { getUniqueDrawNames } from "@/config/draw-schedule";
import { format, parseISO, isValid, parse as dateParseFn } from 'date-fns'; // Renamed parse to dateParseFn
import { useSidebar } from '@/components/ui/sidebar';


type LotteryResultWithId = LotteryResult & { clientId: string };
const ADMIN_DATA_STORAGE_KEY = 'lotocrackAdminData';

const lotteryResultSchema = z.object({
  draw_name: z.string().min(1, "Le nom du tirage est requis."),
  date: z.string().refine(val => {
    try {
      // Use the renamed dateParseFn here
      const parsed = dateParseFn(val, 'yyyy-MM-dd', new Date());
      return isValid(parsed) && format(parsed, 'yyyy-MM-dd') === val;
    } catch {
      return false;
    }
  }, { message: "Date invalide. Format YYYY-MM-DD attendu." }),
  gagnants: z.array(z.number().int().min(1, "Numéro trop petit.").max(90, "Numéro trop grand.")).length(5, "5 numéros gagnants requis."),
  machine: z.array(z.number().int().min(0, "Numéro machine doit être >= 0").max(90, "Numéro machine trop grand."))
    .refine(arr => {
      if (arr.length === 0) return true;
      if (arr.length === 5) {
        if (arr.every(num => num === 0)) return true;
        return arr.every(num => num >= 1 && num <= 90);
      }
      return false;
    }, {
      message: "Numéros machine: vide, ou cinq '0', ou 5 numéros (1-90).",
    }).optional().default([]),
});
type LotteryFormValues = z.infer<typeof lotteryResultSchema>;

interface NumberArrayInputProps {
  value: number[] | undefined;
  onChange: (numbers: number[]) => void;
  onBlur: () => void;
  id: string;
  placeholder: string;
  'aria-label': string;
  disabled?: boolean;
}

const NumberArrayInput: React.FC<NumberArrayInputProps> = ({ value: rhfValue, onChange: rhfOnChange, onBlur: rhfOnBlur, id, placeholder, 'aria-label': ariaLabel, disabled }) => {
  const [inputValue, setInputValue] = useState(Array.isArray(rhfValue) ? rhfValue.join(',') : '');

  useEffect(() => {
    setInputValue(Array.isArray(rhfValue) ? rhfValue.join(',') : '');
  }, [rhfValue]);

  const parseNumbersString = (str: string): number[] => {
    if (!str.trim()) return [];
    return str.split(/[,;\s]+/)
              .map(s => s.trim())
              .filter(s => s.length > 0) 
              .map(s => parseInt(s, 10))
              .filter(n => !isNaN(n) && n >= 0 && n <= 90);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    setInputValue(rawValue);
    // Allow only digits, commas, and spaces for better UX, parse on blur/submit
    if (/^[\d,\s]*$/.test(rawValue)) {
        rhfOnChange(parseNumbersString(rawValue)); // Update RHF immediately for live validation feedback if desired
    }
  };

  const handleInputBlur = () => {
    // Ensure final parsed value is set on blur
    rhfOnChange(parseNumbersString(inputValue));
    rhfOnBlur(); // Trigger RHF's onBlur
  };

  return (
    <Input
      id={id}
      placeholder={placeholder}
      onChange={handleInputChange}
      onBlur={handleInputBlur} // Use RHF's onBlur
      value={inputValue} // Controlled by local state for typing flexibility
      aria-label={ariaLabel}
      disabled={disabled}
    />
  );
};


export default function AdminPage() {
  const { toast } = useToast();
  const [isImporting, startImportTransition] = useTransition();
  const [isExporting, startExportTransition] = useTransition();
  const [isProcessing, startProcessingTransition] = useTransition();

  const [adminData, setAdminData] = useState<LotteryResultWithId[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [initialLoadMessage, setInitialLoadMessage] = useState<string | null>(null);

  const [selectedJsonFile, setSelectedJsonFile] = useState<File | null>(null);


  const [viewCategory, setViewCategory] = useState<string>("all");

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingResult, setEditingResult] = useState<LotteryResultWithId | null>(null);

  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [deletingResultClientId, setDeletingResultClientId] = useState<string | null>(null);

  const [isResetCategoryDialogOpen, setIsResetCategoryDialogOpen] = useState(false);
  const [categoryToReset, setCategoryToReset] = useState<string>("");

  const [importFilterDrawName, setImportFilterDrawName] = useState<string>("all");
  const [exportFilterDrawName, setExportFilterDrawName] = useState<string>("all");

  const { setOpenMobile: closeSheet } = useSidebar();

  const drawNames = getUniqueDrawNames();

  const { register, handleSubmit, control, reset, formState: { errors }, setValue } = useForm<LotteryFormValues>({
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
      const storedData = localStorage.getItem(ADMIN_DATA_STORAGE_KEY);
      if (storedData) {
        const parsedData = JSON.parse(storedData) as LotteryResultWithId[];
        const normalizedData = parsedData.map(r => ({...r, machine: Array.isArray(r.machine) ? r.machine : []}));
        setAdminData(normalizedData);
        setInitialLoadMessage(`Données chargées depuis le stockage local (${normalizedData.length} résultats).`);
        setIsLoadingData(false);
        return;
      }

      const response = await fetch('/api/results');
      if (!response.ok) {
        let errorMsg = `Échec de la récupération des données API: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (e) {
           try {
            const errorText = await response.text();
            console.error("Server error response (text) for initial data load:", errorText);
            if (errorText && errorText.length < 200) errorMsg += ` - ${errorText.substring(0,100)}`;
          } catch (textErr) { /* Do nothing more */ }
        }
        throw new Error(errorMsg);
      }
      const results: LotteryResult[] = await response.json();
      if (Array.isArray(results)) {
        const dataWithClientIds = results.map(r => ({
            ...r,
            clientId: r.clientId || `${r.draw_name}-${r.date}-${Math.random().toString(36).substr(2, 9)}`,
            machine: Array.isArray(r.machine) ? r.machine : []
        }));
        setAdminData(dataWithClientIds);
        localStorage.setItem(ADMIN_DATA_STORAGE_KEY, JSON.stringify(dataWithClientIds));
        setInitialLoadMessage(`${dataWithClientIds.length} résultats chargés depuis l'API et sauvegardés localement.`);
      } else {
        setAdminData([]);
        setInitialLoadMessage("Aucun résultat valide retourné par l'API. Les données locales seront vides.");
      }
    } catch (error: any) {
      toast({ title: "Erreur de chargement initial", description: error.message, variant: "destructive" });
      setAdminData([]);
      setInitialLoadMessage(`Erreur lors du chargement initial des données: ${error.message}`);
    } finally {
      setIsLoadingData(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAndInitializeAdminData();
  }, [fetchAndInitializeAdminData]);

  useEffect(() => {
    if (!isLoadingData) {
      localStorage.setItem(ADMIN_DATA_STORAGE_KEY, JSON.stringify(adminData));
    }
  }, [adminData, isLoadingData]);


  const handleJsonFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedJsonFile(event.target.files?.[0] || null);
  };


  const processImportedData = (importedData: LotteryResult[] | undefined, source: string) => {
    if (importedData && importedData.length > 0) {
      const newDataWithClientIds = importedData.map(r => ({
          ...r,
          clientId: r.clientId || `${r.draw_name}-${r.date}-${Math.random().toString(36).substr(2, 9)}`,
          machine: Array.isArray(r.machine) ? r.machine : []
      }));
      let addedCount = 0;
      let duplicatesPrevented = 0;
      setAdminData(prevData => {
          const existingKeys = new Set(prevData.map(d => `${d.draw_name}-${d.date}`));
          const toAdd: LotteryResultWithId[] = [];
          newDataWithClientIds.forEach(nd => {
              if (!existingKeys.has(`${nd.draw_name}-${nd.date}`)) {
                  toAdd.push(nd);
                  existingKeys.add(`${nd.draw_name}-${nd.date}`);
              } else {
                  duplicatesPrevented++;
              }
          });
          addedCount = toAdd.length;
          return [...prevData, ...toAdd].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      });

      let toastDescription = `Importation de ${importedData.length} résultat(s) depuis ${source} terminée.`;
      toastDescription += ` ${addedCount} nouveau(x) résultat(s) ont été ajouté(s).`;
      if (duplicatesPrevented > 0) {
        toastDescription += ` ${duplicatesPrevented} doublon(s) ont été évité(s).`;
      }
      toast({ title: "Importation Réussie", description: toastDescription });

    } else {
       toast({ title: `Importation depuis ${source}`, description: `Aucun nouveau résultat valide à importer depuis ${source}.`, variant: "default" });
    }
  };

  const handleJsonImportSubmit = async () => {
    if (!selectedJsonFile) return toast({ title: "Aucun fichier JSON", description: "Sélectionnez un fichier JSON.", variant: "destructive" });
    const formData = new FormData();
    formData.append("jsonFile", selectedJsonFile);
    startImportTransition(async () => {
      const result = await importLotteryDataFromJson(formData, importFilterDrawName === "all" ? null : importFilterDrawName);
      if (result.success) {
        processImportedData(result.data, "JSON");
        if (result.message) { // Display specific message from action
            toast({title: "Info Importation JSON", description: result.message});
        }
      } else {
        toast({ title: "Erreur d'Importation JSON", description: result.error, variant: "destructive" });
      }
      setSelectedJsonFile(null);
      const fileInput = document.getElementById('jsonFile') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
    });
  };


  const handleExportSubmit = async (formatType: 'json') => { 
    startExportTransition(async () => {
      let result;
      const filter = exportFilterDrawName === "all" ? null : exportFilterDrawName;
      if (formatType === 'json') {
        result = await exportLotteryDataToJson(adminData, filter);
        if (result.success && result.jsonData) {
            const blob = new Blob([result.jsonData], { type: 'application/json' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = result.fileName || 'LotoBonheurInsights_export_admin.json';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(link.href);
            toast({ title: "Exportation JSON Réussie", description: "Fichier JSON téléchargé." });
        } else {
            toast({ title: "Erreur d'Exportation JSON", description: result.error, variant: "destructive" });
        }
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

      let machineNumbers = data.machine ? data.machine : [];
      if (machineNumbers.length === 5 && machineNumbers.every(n => n === 0)) {
        machineNumbers = [];
      }

      const actionResult = await addLotteryResultAction({
        ...data,
        machine: machineNumbers,
      });
      if (actionResult.success && actionResult.result) {
        setAdminData(prev => [...prev, { ...actionResult.result!, clientId: actionResult.result!.clientId || Date.now().toString(), machine: Array.isArray(actionResult.result!.machine) ? actionResult.result!.machine : [] }].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
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
      let machineNumbers = data.machine ? data.machine : [];
      if (machineNumbers.length === 5 && machineNumbers.every(n => n === 0)) {
        machineNumbers = [];
      }
      const actionResult = await updateLotteryResultAction(editingResult.clientId, {
        ...data,
        machine: machineNumbers,
      });
      if (actionResult.success && actionResult.result) {
        setAdminData(prev => prev.map(r => r.clientId === editingResult.clientId ? { ...r, ...actionResult.result!, clientId: editingResult.clientId, machine: Array.isArray(actionResult.result!.machine) ? actionResult.result!.machine : [] } : r).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
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
      machine: Array.isArray(resultToEdit.machine) ? resultToEdit.machine.map(Number) : []
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
      const actionResult = await deleteLotteryResultAction(deletingResultClientId);
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

  const handleResetCategoryClick = () => {
    if (!categoryToReset || categoryToReset === "all") { 
        toast({title: "Aucune catégorie valide", description: "Veuillez sélectionner une catégorie spécifique à réinitialiser.", variant: "destructive"});
        return;
    }
    setIsResetCategoryDialogOpen(true);
  };

  const confirmResetCategory = async () => {
    if (!categoryToReset || categoryToReset === "all") return;
    startProcessingTransition(async () => {
      const actionResult = await resetCategoryDataAction(categoryToReset);
      if (actionResult.success) {
        setAdminData(prev => prev.filter(r => r.draw_name !== categoryToReset));
        toast({ title: "Succès", description: actionResult.message });
      } else {
        toast({ title: "Erreur", description: actionResult.error, variant: "destructive" });
      }
      setIsResetCategoryDialogOpen(false);
    });
  };

  const filteredData = viewCategory === "all" ? adminData : adminData.filter(r => r.draw_name === viewCategory);


  return (
    <div className="space-y-8 p-4 md:p-6 lg:p-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl font-bold">Interface d'Administration LotoBonheur Insights</CardTitle>
          <CardDescription>
            Gestion des données des tirages Loto Bonheur. Les modifications ici affectent les données stockées localement dans votre navigateur.
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
                <strong>Authentification :</strong> Une authentification sécurisée est requise pour protéger cette interface en production.
            </p>
             <p className="text-muted-foreground mt-2">
                <strong>Persistance des Données :</strong> Actuellement, les données sont stockées dans `localStorage`. Pour une solution robuste, une base de données (ex: Firebase Firestore) est recommandée.
            </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-1 gap-6"> 
         {/* JSON Import/Export */}
        <Card>
            <CardHeader><CardTitle className="flex items-center"><FileJson className="mr-2"/>Importer/Exporter (JSON)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <Label htmlFor="jsonFile">Importer un fichier JSON</Label>
                    <Input id="jsonFile" type="file" accept=".json,application/json" onChange={handleJsonFileChange} className="mt-1" />
                    <p className="text-xs text-muted-foreground mt-1">
                        Format attendu: un tableau d'objets. Chaque objet: {" { \"draw_name\": \"NOM\", \"date\": \"YYYY-MM-DD\", \"gagnants\": [n1,n2,n3,n4,n5], \"machine\": [m1,m2,m3,m4,m5] ou [] } "}.
                        Dates alternatives (ex: DD/MM/YYYY) sont aussi acceptées.
                    </p>
                </div>
                <div className="mt-2">
                    <Label htmlFor="importFilterDrawNameJson">Filtrer par catégorie (Optionnel)</Label>
                    <Select value={importFilterDrawName} onValueChange={setImportFilterDrawName}>
                        <SelectTrigger id="importFilterDrawNameJson"><SelectValue placeholder="Sélectionner une catégorie" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Toutes les catégories du JSON</SelectItem>
                            {drawNames.map(name => <SelectItem key={`import-json-${name}`} value={name}>{name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={handleJsonImportSubmit} disabled={isImporting || !selectedJsonFile} className="w-full mt-2">
                {isImporting && selectedJsonFile ? <Loader2 className="animate-spin mr-2" /> : <UploadCloud className="mr-2" />} Importer JSON
                </Button>
                <hr className="my-4"/>
                <div>
                    <Label htmlFor="exportFilterDrawNameJson">Exporter par catégorie (Optionnel)</Label>
                     <Select value={exportFilterDrawName} onValueChange={setExportFilterDrawName}>
                        <SelectTrigger id="exportFilterDrawNameJson"><SelectValue placeholder="Sélectionner une catégorie" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Toutes les catégories</SelectItem>
                            {drawNames.map(name => <SelectItem key={`export-json-${name}`} value={name}>{name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <Button onClick={() => handleExportSubmit('json')} disabled={isExporting || adminData.length === 0} className="w-full mt-2">
                {isExporting ? <Loader2 className="animate-spin mr-2" /> : <DownloadCloud className="mr-2" />} Exporter JSON
                </Button>
            </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center"><Eye className="mr-2 h-5 w-5" /> Visualiser et Gérer les Données</CardTitle>
            <CardDescription>Affichez ({filteredData.length}), modifiez ou supprimez les résultats.</CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
                <Button onClick={() => { reset({ draw_name: drawNames.length > 0 ? drawNames[0] : "", date: format(new Date(), 'yyyy-MM-dd'), gagnants: [], machine: [] }); setIsAddDialogOpen(true); closeSheet(false); }}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Ajouter un Résultat
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Ajouter un Nouveau Résultat</DialogTitle></DialogHeader>
                <form onSubmit={handleSubmit(onAddSubmit)} className="space-y-4">
                    <FormItemField control={control} name="draw_name" label="Nom du Tirage" drawNames={drawNames} errors={errors} />
                    <FormItemField control={control} name="date" label="Date" type="date" register={register} errors={errors} />
                    <FormItemNumberArray control={control} name="gagnants" label="Numéros Gagnants (séparés par virgule/espace)" placeholder="1,2,3,4,5" errors={errors} />
                    <FormItemNumberArray control={control} name="machine" label="Numéros Machine (Optionnel: vide, ou cinq '0', ou 5 numéros)" placeholder="Ex: 6,7,8,9,10 ou laisser vide" errors={errors} />
                    <DialogFooter>
                        <DialogClose asChild><Button type="button" variant="outline">Annuler</Button></DialogClose>
                        <Button type="submit" disabled={isProcessing}>{isProcessing ? <Loader2 className="animate-spin"/> : "Ajouter"}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Label htmlFor="viewCategory" className="flex items-center"><Filter className="mr-2 h-4 w-4" />Filtrer par catégorie</Label>
            <Select value={viewCategory} onValueChange={setViewCategory}>
              <SelectTrigger id="viewCategory"><SelectValue placeholder="Sélectionner une catégorie" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les catégories ({adminData.length})</SelectItem>
                {drawNames.map(name => <SelectItem key={name} value={name}>{name} ({adminData.filter(r => r.draw_name === name).length})</SelectItem>)}
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
            <div className="overflow-x-auto rounded-md border max-h-[500px]">
                <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
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
                        <TableCell>{r.machine && r.machine.length > 0 ? r.machine.join(', ') : 'N/A'}</TableCell>
                        <TableCell className="space-x-1 text-right">
                            <Button variant="outline" size="icon" onClick={() => { openEditDialog(r); closeSheet(false);}} aria-label={`Modifier le résultat du ${format(parseISO(r.date), 'dd/MM/yyyy')} pour ${r.draw_name}`}><Edit className="h-4 w-4" /></Button>
                            <Button variant="destructive" size="icon" onClick={() => { handleDeleteClick(r.clientId!); closeSheet(false);}} aria-label={`Supprimer le résultat du ${format(parseISO(r.date), 'dd/MM/yyyy')} pour ${r.draw_name}`}><Trash2 className="h-4 w-4" /></Button>
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
                Recharger les Données de l'API (Écrase les données locales)
            </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={isResetCategoryDialogOpen} onOpenChange={setIsResetCategoryDialogOpen}>
        <Card>
          <CardHeader><CardTitle>Réinitialiser les Données par Catégorie</CardTitle></CardHeader>
          <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                  <div className="flex-grow">
                      <Label htmlFor="resetCategorySelect">Catégorie à réinitialiser</Label>
                      <Select value={categoryToReset} onValueChange={setCategoryToReset}>
                          <SelectTrigger id="resetCategorySelect"><SelectValue placeholder="Sélectionner une catégorie" /></SelectTrigger>
                          <SelectContent>
                          {drawNames.map(name => <SelectItem key={`reset-${name}`} value={name}>{name}</SelectItem>)}
                          </SelectContent>
                      </Select>
                  </div>
                  <AlertDialogTrigger asChild>
                      <Button variant="destructive" disabled={!categoryToReset || categoryToReset === "all" || isProcessing} onClick={() => {handleResetCategoryClick(); closeSheet(false); }}>
                            {isProcessing && categoryToReset ? <Loader2 className="animate-spin mr-2 h-4 w-4"/> : <Trash2 className="mr-2 h-4 w-4" />} Réinitialiser la Catégorie
                      </Button>
                  </AlertDialogTrigger>
              </div>
               <p className="text-xs text-muted-foreground">Attention: La sélection "Toutes les catégories" ne peut pas être réinitialisée ici. Choisissez une catégorie spécifique.</p>
          </CardContent>
        </Card>
        <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Confirmer la Réinitialisation</AlertDialogTitle></AlertDialogHeader>
            <AlertDialogDescription>
            Êtes-vous sûr de vouloir supprimer TOUS les résultats pour la catégorie "{categoryToReset}" ? Cette action est irréversible.
            </AlertDialogDescription>
            <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setIsResetCategoryDialogOpen(false); } }>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={confirmResetCategory} disabled={isProcessing} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">
                {isProcessing ? <Loader2 className="animate-spin"/> : "Réinitialiser"}
            </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Result Dialog */}
       <Dialog open={isEditDialogOpen} onOpenChange={(open) => { setIsEditDialogOpen(open); if (!open) setEditingResult(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier le Résultat</DialogTitle></DialogHeader>
          {editingResult && (
            <form onSubmit={handleSubmit(onEditSubmit)} className="space-y-4">
                <FormItemField control={control} name="draw_name" label="Nom du Tirage" drawNames={drawNames} errors={errors} disabled={true} />
                <FormItemField control={control} name="date" label="Date" type="date" register={register} errors={errors} disabled={true}/>
                <FormItemNumberArray control={control} name="gagnants" label="Numéros Gagnants (séparés par virgule/espace)" placeholder="1,2,3,4,5" errors={errors} />
                <FormItemNumberArray control={control} name="machine" label="Numéros Machine (Optionnel: vide, ou cinq '0', ou 5 numéros)" placeholder="Ex: 6,7,8,9,10 ou laisser vide" errors={errors} />
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

    </div>
  );
}


// Helper components for form fields to reduce repetition
interface FormItemFieldProps {
    control: any;
    name: keyof LotteryFormValues;
    label: string;
    drawNames?: string[];
    type?: string;
    register?: any;
    errors: any;
    disabled?: boolean;
}

const FormItemField: React.FC<FormItemFieldProps> = ({ control, name, label, drawNames, type, register, errors, disabled }) => (
    <div>
        <Label htmlFor={name.toString()}>{label}</Label>
        {type === 'date' ? (
            <Input id={name.toString()} type="date" {...register(name)} disabled={disabled} />
        ) : drawNames ? (
            <Controller
                name={name as any}
                control={control}
                render={({ field }) => (
                    <Select onValueChange={field.onChange} value={field.value} disabled={disabled}>
                        <SelectTrigger id={name.toString()}><SelectValue placeholder="Sélectionner tirage" /></SelectTrigger>
                        <SelectContent>{drawNames.map(dn => <SelectItem key={`select-${name}-${dn}`} value={dn}>{dn}</SelectItem>)}</SelectContent>
                    </Select>
                )}
            />
        ) : null}
        {errors[name]?.message && <p className="text-destructive text-sm">{errors[name].message as string}</p>}
    </div>
);

interface FormItemNumberArrayProps {
    control: any;
    name: keyof LotteryFormValues;
    label: string;
    placeholder: string;
    errors: any;
    disabled?: boolean;
}

const FormItemNumberArray: React.FC<FormItemNumberArrayProps> = ({ control, name, label, placeholder, errors, disabled }) => (
    <div>
        <Label htmlFor={name.toString()}>{label}</Label>
        <Controller
            name={name as any}
            control={control}
            render={({ field }) => (
                <NumberArrayInput
                    id={name.toString()}
                    placeholder={placeholder}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    aria-label={label}
                    disabled={disabled}
                />
            )}
        />
        {errors[name]?.message && <p className="text-destructive text-sm">{errors[name].message as string}</p>}
    </div>
);

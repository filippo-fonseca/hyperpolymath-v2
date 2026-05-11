"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateProject } from "@/app/actions/projects";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: {
    id: string;
    courseCode: string | null;
    courseTitle: string | null;
    instructor: string | null;
    grade: string | null;
    credits: number | null;
    distributionals: string[] | null;
    semesterTerm: "fall" | "spring" | "summer" | null;
    semesterYear: number | null;
  };
  graduationYear: number | null;
}

interface FormValues {
  courseCode: string;
  courseTitle: string;
  instructor: string;
  semesterTerm: "fall" | "spring" | "summer" | "";
  semesterYear: string;
  grade: string;
  credits: string;
  distributionals: string;
}

function getSemesterYears(graduationYear: number | null): number[] {
  const currentYear = new Date().getFullYear();
  if (graduationYear) {
    const start = graduationYear - 5;
    const end = graduationYear + 1;
    const years: number[] = [];
    for (let y = start; y <= end; y++) years.push(y);
    return years;
  }
  return [currentYear - 2, currentYear - 1, currentYear, currentYear + 1, currentYear + 2];
}

/**
 * Edit class metadata dialog — per D-16 / UI-SPEC §"Class metadata: inline header + Edit class button".
 * Opens from ProjectHeader "Edit class" button.
 * Saves via updateProject Server Action.
 */
export function ProjectEditClassDialog({
  open,
  onOpenChange,
  project,
  graduationYear,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const semesterYears = getSemesterYears(graduationYear);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { isDirty, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      courseCode: project.courseCode ?? "",
      courseTitle: project.courseTitle ?? "",
      instructor: project.instructor ?? "",
      semesterTerm: project.semesterTerm ?? "",
      semesterYear: project.semesterYear ? String(project.semesterYear) : "",
      grade: project.grade ?? "",
      credits: project.credits ? String(project.credits) : "",
      distributionals: project.distributionals?.join(", ") ?? "",
    },
  });

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  async function onSubmit(values: FormValues) {
    startTransition(async () => {
      const result = await updateProject({
        id: project.id,
        isClass: true,
        courseCode: values.courseCode.trim() || null,
        courseTitle: values.courseTitle.trim() || null,
        instructor: values.instructor.trim() || null,
        semesterTerm: (values.semesterTerm || null) as
          | "fall"
          | "spring"
          | "summer"
          | null,
        semesterYear: values.semesterYear
          ? parseInt(values.semesterYear, 10)
          : null,
        grade: values.grade.trim() || null,
        credits: values.credits ? parseInt(values.credits, 10) : null,
        distributionals:
          values.distributionals.trim()
            ? values.distributionals
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 10)
            : null,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast("Class metadata updated.");
      handleClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-semibold">
            Edit class metadata
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {/* Course code */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-code" className="font-sans text-[13px]">
              Course code <span className="text-destructive">*</span>
            </Label>
            <Input
              id="ec-code"
              {...register("courseCode")}
              placeholder="e.g. ANTH 248"
              className="h-9"
            />
          </div>

          {/* Course title */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-title" className="font-sans text-[13px]">
              Course title
            </Label>
            <Input
              id="ec-title"
              {...register("courseTitle")}
              placeholder="e.g. Anthropology of Money"
              className="h-9"
            />
          </div>

          {/* Instructor */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-instructor" className="font-sans text-[13px]">
              Instructor
            </Label>
            <Input
              id="ec-instructor"
              {...register("instructor")}
              placeholder="e.g. Lloyd"
              className="h-9"
            />
          </div>

          {/* Semester term + year */}
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label className="font-sans text-[13px]">Term</Label>
              <Controller
                name="semesterTerm"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Term" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fall">Fall</SelectItem>
                      <SelectItem value="spring">Spring</SelectItem>
                      <SelectItem value="summer">Summer</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label className="font-sans text-[13px]">Year</Label>
              <Controller
                name="semesterYear"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Year" />
                    </SelectTrigger>
                    <SelectContent>
                      {semesterYears.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {/* Grade */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-grade" className="font-sans text-[13px]">
              Grade
            </Label>
            <Input
              id="ec-grade"
              {...register("grade")}
              placeholder="e.g. A-"
              className="h-9 w-24"
            />
          </div>

          {/* Credits */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-credits" className="font-sans text-[13px]">
              Credits
            </Label>
            <Input
              id="ec-credits"
              type="number"
              min={0}
              max={20}
              {...register("credits")}
              placeholder="4"
              className="h-9 w-24"
            />
          </div>

          {/* Distributionals */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ec-dist" className="font-sans text-[13px]">
              Distributionals
            </Label>
            <Input
              id="ec-dist"
              {...register("distributionals")}
              placeholder="e.g. WR, SO (comma separated)"
              className="h-9"
            />
          </div>

          <DialogFooter className="mt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              {isDirty ? "Discard changes" : "Never mind"}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

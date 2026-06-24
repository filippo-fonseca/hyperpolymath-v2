"use client";

import { createProject } from "@/app/actions/projects";
import { usePendingAction } from "@/components/shared/use-pending-action";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { BannerPicker } from "./BannerPicker";
import { IconPicker } from "./IconPicker";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAreaId?: string;
  areas: { id: string; name: string }[];
  graduationYear: number | null;
}

interface FormValues {
  areaId: string;
  name: string;
  description: string;
  icon: string | null;
  bannerUrl: string | null;
  startDate: string;
  endDate: string;
  isClass: boolean;
  courseCode: string;
  courseTitle: string;
  instructor: string;
  semesterTerm: "fall" | "spring" | "summer" | "";
  semesterYear: string;
  grade: string;
  credits: string;
  distributionals: string;
}

/**
 * Derives allowed semester years from graduation year.
 * Range: [graduationYear - 5 .. graduationYear + 1].
 * Falls back to current year ±2 if no graduation year set.
 */
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
 * Project create dialog — per PROJ-01 + PROJ-05.
 * Contains base fields + class section gated by checkbox.
 * Semester years derived from user's graduation year.
 */
export function ProjectCreateDialog({
  open,
  onOpenChange,
  defaultAreaId,
  areas,
  graduationYear,
}: Props) {
  const router = useRouter();
  const { run, pending } = usePendingAction();
  const semesterYears = getSemesterYears(graduationYear);
  // RT-05: client generates UUID so the Realtime echo arrives with the same id
  // when the new project lands in the sidebar tree (the SidebarTree's projects
  // useOptimistic dedupes).

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { isDirty },
  } = useForm<FormValues>({
    defaultValues: {
      areaId: defaultAreaId ?? areas[0]?.id ?? "",
      name: "",
      description: "",
      icon: null,
      bannerUrl: null,
      startDate: "",
      endDate: "",
      isClass: false,
      courseCode: "",
      courseTitle: "",
      instructor: "",
      semesterTerm: "",
      semesterYear: "",
      grade: "",
      credits: "",
      distributionals: "",
    },
  });

  const isClass = watch("isClass");

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  async function onSubmit(values: FormValues) {
    const newId = crypto.randomUUID();
    const payload = {
      id: newId,
      areaId: values.areaId,
      name: values.name.trim(),
      description: values.description.trim() || null,
      icon: values.icon || null,
      bannerUrl: values.bannerUrl || null,
      startDate: values.startDate || null,
      endDate: values.endDate || null,
      isClass: values.isClass,
      courseCode: values.isClass ? values.courseCode.trim() || null : null,
      courseTitle: values.isClass ? values.courseTitle.trim() || null : null,
      instructor: values.isClass ? values.instructor.trim() || null : null,
      semesterTerm: (values.isClass && values.semesterTerm ? values.semesterTerm : null) as
        | "fall"
        | "spring"
        | "summer"
        | null,
      semesterYear:
        values.isClass && values.semesterYear ? Number.parseInt(values.semesterYear, 10) : null,
      grade: values.isClass ? values.grade.trim() || null : null,
      credits: values.isClass && values.credits ? Number.parseInt(values.credits, 10) : null,
      distributionals:
        values.isClass && values.distributionals.trim()
          ? values.distributionals
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
              .slice(0, 10)
          : null,
    };

    await run(() => createProject(payload), {
      success: "Project created.",
      onSuccess: () => {
        handleClose();
        router.push(`/projects/${payload.id}`);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">New Project</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {/* Area */}
          <div className="flex flex-col gap-1.5">
            <Label className="font-sans text-[13px]">Area</Label>
            <Controller
              name="areaId"
              control={control}
              rules={{ required: true }}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select area" />
                  </SelectTrigger>
                  <SelectContent>
                    {areas.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proj-name" className="font-sans text-[13px]">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="proj-name"
              {...register("name", { required: true })}
              placeholder="e.g. Running Club"
              className="h-9"
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="proj-desc" className="font-sans text-[13px]">
              Description
            </Label>
            <Textarea
              id="proj-desc"
              {...register("description")}
              placeholder="Optional project description"
              className="resize-none min-h-[72px]"
            />
          </div>

          {/* Icon + Banner */}
          <div className="flex gap-4 items-end">
            <div className="flex flex-col gap-1.5">
              <Label className="font-sans text-[13px]">Icon</Label>
              <Controller
                name="icon"
                control={control}
                render={({ field }) => <IconPicker value={field.value} onChange={field.onChange} />}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="font-sans text-[13px]">Banner</Label>
              <Controller
                name="bannerUrl"
                control={control}
                render={({ field }) => (
                  <BannerPicker value={field.value} onChange={field.onChange} />
                )}
              />
            </div>
          </div>

          {/* Dates */}
          <div className="flex gap-3">
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="proj-start" className="font-sans text-[13px]">
                Start date
              </Label>
              <Input id="proj-start" type="date" {...register("startDate")} className="h-9" />
            </div>
            <div className="flex flex-col gap-1.5 flex-1">
              <Label htmlFor="proj-end" className="font-sans text-[13px]">
                End date
              </Label>
              <Input id="proj-end" type="date" {...register("endDate")} className="h-9" />
            </div>
          </div>

          {/* Class toggle */}
          <div className="flex items-center gap-2">
            <Controller
              name="isClass"
              control={control}
              render={({ field }) => (
                <Checkbox
                  id="proj-is-class"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="proj-is-class" className="font-sans text-[13px] cursor-pointer">
              This is a class
            </Label>
          </div>

          {/* Class fields (conditional) */}
          {isClass && (
            <div className="flex flex-col gap-3 pl-4 border-l-2 border-border">
              {/* Course code */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="proj-course-code" className="font-sans text-[13px]">
                  Course code <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="proj-course-code"
                  {...register("courseCode")}
                  placeholder="e.g. ANTH 248"
                  className="h-9"
                />
              </div>

              {/* Course title */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="proj-course-title" className="font-sans text-[13px]">
                  Course title
                </Label>
                <Input
                  id="proj-course-title"
                  {...register("courseTitle")}
                  placeholder="e.g. Anthropology of Money"
                  className="h-9"
                />
              </div>

              {/* Instructor */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="proj-instructor" className="font-sans text-[13px]">
                  Instructor
                </Label>
                <Input
                  id="proj-instructor"
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
                <Label htmlFor="proj-grade" className="font-sans text-[13px]">
                  Grade
                </Label>
                <Input
                  id="proj-grade"
                  {...register("grade")}
                  placeholder="e.g. A-"
                  className="h-9 w-24"
                />
              </div>

              {/* Credits */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="proj-credits" className="font-sans text-[13px]">
                  Credits
                </Label>
                <Input
                  id="proj-credits"
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
                <Label htmlFor="proj-dist" className="font-sans text-[13px]">
                  Distributionals
                </Label>
                <Input
                  id="proj-dist"
                  {...register("distributionals")}
                  placeholder="e.g. WR, SO (comma separated)"
                  className="h-9"
                />
              </div>
            </div>
          )}

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={pending}>
              {isDirty ? "Discard changes" : "Never mind"}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "New Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
